import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from './api.service';

export type EntitlementState = 'ACTIVE' | 'TRIAL' | 'TRIAL_EXPIRED' | 'SUSPENDED';

export type EntitlementFeature = 'finance' | 'exams' | 'portals' | 'multiBranch';

export interface EntitlementsPlan {
  code: string;
  name: string;
  maxStudents: number;
  maxTeachers: number;
  features: Record<string, boolean>;
}

export interface EntitlementsUsage {
  students: number;
  teachers: number;
  branches: number;
  members: number;
}

export interface EntitlementsSnapshot {
  state: EntitlementState;
  canWrite: boolean;
  plan: EntitlementsPlan | null;
  trialEndsAt: string | null;
  graceEndsAt: string | null;
  suspendedAt: string | null;
  suspensionReason: string | null;
  usage: EntitlementsUsage;
}

const DAY_MS = 86_400_000;

/** Features that stay available when the tenant has no plan attached. */
const CORE_FEATURES: ReadonlySet<EntitlementFeature> = new Set<EntitlementFeature>([
  'finance',
  'exams',
  'portals',
]);

@Injectable({ providedIn: 'root' })
export class EntitlementsService {
  private readonly api = inject(ApiService);

  readonly snapshot = signal<EntitlementsSnapshot | null>(null);
  readonly loaded = signal(false);

  readonly state = computed<EntitlementState | null>(() => this.snapshot()?.state ?? null);
  readonly canWrite = computed(() => this.snapshot()?.canWrite ?? true);
  readonly plan = computed<EntitlementsPlan | null>(() => this.snapshot()?.plan ?? null);
  readonly usage = computed<EntitlementsUsage | null>(() => this.snapshot()?.usage ?? null);
  readonly isSuspended = computed(() => this.state() === 'SUSPENDED');

  /** Whole days remaining on a trial; `null` for every other state. */
  readonly trialDaysLeft = computed<number | null>(() => {
    const snapshot = this.snapshot();
    if (!snapshot || snapshot.state !== 'TRIAL' || !snapshot.trialEndsAt) return null;
    const endsAt = new Date(snapshot.trialEndsAt).getTime();
    if (Number.isNaN(endsAt)) return null;
    return Math.max(0, Math.ceil((endsAt - Date.now()) / DAY_MS));
  });

  private inFlight: Promise<void> | null = null;

  has(feature: EntitlementFeature): boolean {
    const plan = this.plan();
    if (!plan) return CORE_FEATURES.has(feature);
    return plan.features?.[feature] === true;
  }

  async load(force = false): Promise<void> {
    if (this.loaded() && !force) return;
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.fetch().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  reset(): void {
    this.snapshot.set(null);
    this.loaded.set(false);
  }

  private async fetch(): Promise<void> {
    try {
      const snapshot = await firstValueFrom(
        this.api.get<EntitlementsSnapshot>('/tenant/entitlements'),
      );
      this.snapshot.set(snapshot);
      this.loaded.set(true);
    } catch (error) {
      // A platform admin session has no tenant, so there are no entitlements to read.
      if (error instanceof HttpErrorResponse && error.status === 403) {
        this.snapshot.set(null);
        this.loaded.set(true);
      }
    }
  }
}
