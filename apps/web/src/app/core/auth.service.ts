import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from './api.service';
import type {
  Membership,
  Permission,
  Role,
  Session,
  SessionUser,
  SupportSession,
  TenantSelection,
} from './models';
import { clearStoredSupportSession, readStoredSupportSession } from './support-session';

const TENANT_KEY = 'musicos.tenant';
const SESSION_KEY = 'musicos.session';
export const MFA_CHALLENGE_KEY = 'musicos.mfa.challenge';

/**
 * Read-only permissions carried by a support grant. Mirrors the API's
 * `SUPPORT_PERMISSIONS`: the synthetic DIRECTOR can read the tenant but cannot
 * manage settings, the platform or the portal.
 */
const SUPPORT_PERMISSIONS: Permission[] = [
  'students.read',
  'teachers.read',
  'academics.read',
  'schedule.read',
  'attendance.read',
  'finance.read',
  'exams.read',
  'documents.read',
  'reports.read',
  'announcements.read',
  'privacy.read',
];

/** Password accepted, second factor pending. Carries no session. */
export interface MfaChallenge {
  mfaRequired: true;
  challengeToken: string;
  expiresAt: string;
}

export type LoginOutcome = Session | MfaChallenge;

export function isMfaChallenge(result: LoginOutcome): result is MfaChallenge {
  return (result as MfaChallenge).mfaRequired === true;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(ApiService);

  readonly user = signal<SessionUser | null>(null);
  readonly memberships = signal<Membership[]>([]);
  readonly activeTenant = signal<Membership | null>(null);
  readonly permissions = signal<Permission[]>([]);
  readonly accessToken = signal<string | null>(null);
  readonly ready = signal(false);
  readonly requiresTenantSelection = signal(false);
  readonly support = signal<SupportSession | null>(null);

  readonly isAuthenticated = computed(() => Boolean(this.accessToken()));
  readonly role = computed<Role | null>(() => this.activeTenant()?.role ?? null);
  readonly isPlatformAdmin = computed(() => this.user()?.isPlatformAdmin === true);
  readonly isTenantUser = computed(() => this.activeTenant() !== null);
  readonly isSupportSession = computed(() => this.support() !== null);
  readonly displayName = computed(() => {
    const user = this.user();
    return user ? `${user.firstName} ${user.lastName}` : '';
  });
  readonly initials = computed(() => {
    const user = this.user();
    return user ? `${user.firstName.charAt(0)}${user.lastName.charAt(0)}` : '';
  });

  private refreshPromise: Promise<string | null> | null = null;

  async bootstrap(): Promise<void> {
    if (!this.hasStoredSession()) {
      this.ready.set(true);
      return;
    }
    try {
      // A stored support grant must never send its synthetic tenant id to
      // /auth/refresh; SupportService.restore() re-enters support afterwards.
      const tenantId = readStoredSupportSession() ? null : this.storedTenantId();
      const session = await firstValueFrom(
        this.api.post<Session>('/auth/refresh', tenantId ? { tenantId } : {}),
      );
      this.applySession(session);
    } catch {
      this.clearSession();
    } finally {
      this.ready.set(true);
    }
  }

  async login(email: string, password: string): Promise<LoginOutcome> {
    const result = await firstValueFrom(
      this.api.post<LoginOutcome>('/auth/login', { email, password }),
    );
    if (isMfaChallenge(result)) {
      // No session is established: the refresh cookie is only set after the
      // second factor is verified.
      return result;
    }
    this.applySession(result);
    return result;
  }

  /** Applies the session returned by `/auth/mfa/verify`. */
  completeMfa(session: Session): void {
    this.applySession(session);
  }

  /**
   * Swaps the tenant context for the synthetic read-only DIRECTOR membership
   * carried by a support grant. The synthetic tenant id is never persisted.
   */
  enterSupport(session: SupportSession): void {
    this.support.set(session);
    this.memberships.set([]);
    this.requiresTenantSelection.set(false);
    this.applySupportContext(session);
  }

  /**
   * Restores the platform session after support mode. Support state is dropped
   * before the refresh so the refreshed server session cannot be overwritten by
   * the synthetic tenant; a failed refresh clears the session gracefully.
   */
  async exitSupport(): Promise<void> {
    const hadSupport = this.support() !== null;
    this.support.set(null);
    clearStoredSupportSession();
    if (!hadSupport) return;

    this.memberships.set([]);
    this.activeTenant.set(null);
    this.permissions.set([]);
    this.requiresTenantSelection.set(false);

    try {
      const session = await firstValueFrom(this.api.post<Session>('/auth/refresh', {}));
      this.applySession(session);
    } catch {
      this.clearSession();
    }
  }

  async selectTenant(tenantId: string): Promise<void> {
    const selection = await firstValueFrom(
      this.api.post<TenantSelection>('/auth/select-tenant', { tenantId }),
    );
    this.accessToken.set(selection.accessToken);
    this.activeTenant.set(selection.activeTenant);
    this.permissions.set(selection.permissions);
    this.requiresTenantSelection.set(false);
    this.persistTenant(selection.activeTenant.tenantId);
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<string> {
    const response = await firstValueFrom(
      this.api.post<{ success: boolean; message: string }>('/auth/change-password', {
        currentPassword,
        newPassword,
      }),
    );
    this.clearSession();
    return response.message;
  }

  async logout(): Promise<void> {
    try {
      await firstValueFrom(this.api.post('/auth/logout'));
    } finally {
      this.clearSession();
    }
  }

  has(permission: Permission): boolean {
    return this.permissions().includes(permission);
  }

  hasAny(...permissions: Permission[]): boolean {
    return permissions.some((permission) => this.has(permission));
  }

  refreshAccessToken(): Promise<string | null> {
    if (!this.refreshPromise) {
      this.refreshPromise = this.performRefresh().finally(() => {
        this.refreshPromise = null;
      });
    }
    return this.refreshPromise;
  }

  private async performRefresh(): Promise<string | null> {
    const support = this.support();
    try {
      // Never send a synthetic `support:*` identifier to /auth/refresh.
      const tenantId = support
        ? null
        : (this.activeTenant()?.tenantId ?? this.storedTenantId());
      const session = await firstValueFrom(
        this.api.post<Session>('/auth/refresh', tenantId ? { tenantId } : {}),
      );

      if (support && this.isGrantUsable(support)) {
        this.applySession(session);
        // The refresh payload is the platform session; put the synthetic
        // read-only tenant back on top of it.
        this.applySupportContext(support);
      } else if (support) {
        // The grant expired locally: drop it and fall back to the platform
        // session. SupportService observes the cleared signal and leaves.
        this.support.set(null);
        clearStoredSupportSession();
        this.memberships.set([]);
        this.activeTenant.set(null);
        this.permissions.set([]);
        this.applySession(session);
      } else {
        this.applySession(session);
      }
      return session.accessToken;
    } catch {
      this.clearSession();
      return null;
    }
  }

  private applySession(session: Session): void {
    this.user.set(session.user);
    this.accessToken.set(session.accessToken);
    this.persistSession(true);

    if (this.support()) {
      // Preserve the synthetic support tenant and its read-only permissions;
      // the platform session must not overwrite them while support is active.
      this.memberships.set([]);
      this.requiresTenantSelection.set(false);
      return;
    }

    this.memberships.set(session.memberships);
    this.activeTenant.set(session.activeTenant);
    this.permissions.set(session.permissions);
    this.requiresTenantSelection.set(session.requiresTenantSelection);
    if (session.activeTenant) {
      // Only a real tenant membership is ever persisted, never `support:*`.
      this.persistTenant(session.activeTenant.tenantId);
    }
  }

  private applySupportContext(session: SupportSession): void {
    this.activeTenant.set({
      id: `support:${session.grant.id}`,
      tenantId: session.tenant.id,
      role: 'DIRECTOR',
      branchId: null,
      tenant: { ...session.tenant, status: 'ACTIVE' },
    });
    this.permissions.set([...SUPPORT_PERMISSIONS]);
  }

  private isGrantUsable(session: SupportSession): boolean {
    return (
      session.grant.status === 'ACTIVE' &&
      new Date(session.grant.expiresAt).getTime() > Date.now()
    );
  }

  private clearSession(): void {
    this.user.set(null);
    this.memberships.set([]);
    this.activeTenant.set(null);
    this.permissions.set([]);
    this.accessToken.set(null);
    this.requiresTenantSelection.set(false);
    this.support.set(null);
    clearStoredSupportSession();
    this.persistSession(false);
  }

  private hasStoredSession(): boolean {
    try {
      return localStorage.getItem(SESSION_KEY) === '1';
    } catch {
      // Storage is blocked; let the server decide via the refresh cookie.
      return true;
    }
  }

  private persistSession(active: boolean): void {
    try {
      if (active) localStorage.setItem(SESSION_KEY, '1');
      else localStorage.removeItem(SESSION_KEY);
    } catch {
      // Private browsing may block storage; the session still works in memory.
    }
  }

  private storedTenantId(): string | null {
    try {
      return localStorage.getItem(TENANT_KEY);
    } catch {
      return null;
    }
  }

  private persistTenant(tenantId: string): void {
    try {
      localStorage.setItem(TENANT_KEY, tenantId);
    } catch {
      // Private browsing may block storage; the session still works in memory.
    }
  }
}
