import { DestroyRef, Injectable, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import type { SupportGrant, SupportSession } from './models';
import {
  SUPPORT_STORAGE_KEY,
  clearStoredSupportSession,
  readStoredSupportSession,
} from './support-session';

/** The countdown only needs minute resolution; 30s keeps it fresh. */
const TICK_MS = 30_000;

@Injectable({ providedIn: 'root' })
export class SupportService {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly session = signal<SupportSession | null>(null);
  readonly active = computed(() => this.session() !== null);
  readonly remainingMs = signal(0);

  private timer: ReturnType<typeof setInterval> | null = null;
  private exiting = false;

  constructor() {
    effect(() => {
      const session = this.session();
      if (!session) return;
      if (!this.auth.isAuthenticated()) {
        // The refresh failed and the session was cleared: drop the banner
        // without navigating, because the login flow and guards own that.
        this.clear();
        return;
      }
      if (!this.auth.isSupportSession()) {
        // AuthService rejected the grant while refreshing; leave support mode.
        void this.exit();
      }
    });

    this.destroyRef.onDestroy(() => this.stopTimer());
  }

  /** Stores and activates a validated grant. */
  enter(session: SupportSession): void {
    this.session.set(session);
    this.persist(session);
    this.auth.enterSupport(session);
    this.startTimer();
  }

  /** Manual exit and client-side expiry: restore the platform session, then leave. */
  async exit(): Promise<void> {
    if (this.exiting) return;
    const hadSession = this.session() !== null || this.auth.isSupportSession();
    this.exiting = true;
    this.stopTimer();
    this.clearState();
    try {
      await this.auth.exitSupport();
    } finally {
      this.exiting = false;
      if (hadSession) await this.router.navigateByUrl('/platform');
    }
  }

  /** Drops local support state without navigating; authentication already ended. */
  clear(): void {
    this.stopTimer();
    this.clearState();
  }

  /** Boot-time validation: only an ACTIVE, unexpired grant may be restored. */
  async restore(): Promise<void> {
    const stored = readStoredSupportSession();
    if (!stored) return;

    if (!this.auth.isAuthenticated()) {
      this.clear();
      return;
    }

    try {
      const grant = await firstValueFrom(
        this.api.get<SupportGrant>(`/platform/support-grants/${stored.grant.id}`),
      );
      const currentUser = this.auth.user();
      if (
        !this.isUsable(grant) ||
        grant.tenant.id !== stored.tenant.id ||
        (grant.actor && currentUser && grant.actor.id !== currentUser.id)
      ) {
        this.clear();
        return;
      }
      this.enter({ grant, tenant: grant.tenant });
    } catch {
      this.clear();
    }
  }

  private isUsable(grant: SupportGrant): boolean {
    return grant.status === 'ACTIVE' && new Date(grant.expiresAt).getTime() > Date.now();
  }

  private startTimer(): void {
    this.stopTimer();
    this.tick();
    if (this.session()) {
      this.timer = setInterval(() => this.tick(), TICK_MS);
    }
  }

  private tick(): void {
    const session = this.session();
    if (!session) {
      this.remainingMs.set(0);
      this.stopTimer();
      return;
    }
    const remaining = new Date(session.grant.expiresAt).getTime() - Date.now();
    this.remainingMs.set(Math.max(0, remaining));
    if (remaining <= 0) {
      this.stopTimer();
      void this.exit();
    }
  }

  private stopTimer(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private clearState(): void {
    this.session.set(null);
    this.remainingMs.set(0);
    clearStoredSupportSession();
  }

  private persist(session: SupportSession): void {
    try {
      sessionStorage.setItem(SUPPORT_STORAGE_KEY, JSON.stringify(session));
    } catch {
      // Storage can be blocked; the in-memory session still works for this tab.
    }
  }
}
