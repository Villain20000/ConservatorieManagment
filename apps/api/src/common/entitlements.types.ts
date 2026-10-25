/**
 * Entitlement contracts.
 *
 * `EntitlementsService` is the single backend source of truth for what a tenant
 * is allowed to do. Nothing else in the API may read `Plan.maxStudents`,
 * `Plan.maxTeachers` or `Plan.features` directly — that rule is what stops plan
 * limits from being scattered across services and drifting out of sync.
 */

/** Plan-gated capabilities. Add a key here, add it to `Plan.features` JSON. */
export type FeatureKey = 'finance' | 'exams' | 'portals' | 'multiBranch';

export const FEATURE_KEYS: readonly FeatureKey[] = [
  'finance',
  'exams',
  'portals',
  'multiBranch',
];

/**
 * `TRIAL_EXPIRED` is derived from `Subscription.trialEndsAt`, never stored —
 * so extending a trial is a single column update and the read-only window
 * appears and disappears on its own.
 */
export type TenantState = 'ACTIVE' | 'TRIAL' | 'TRIAL_EXPIRED' | 'SUSPENDED';

export interface PlanSnapshot {
  code: string;
  name: string;
  maxStudents: number;
  maxTeachers: number;
  features: Record<FeatureKey, boolean>;
}

export interface EntitlementsUsage {
  students: number;
  teachers: number;
  branches: number;
  members: number;
}

export interface EntitlementsSnapshot {
  state: TenantState;
  /** False during the trial-expired grace window and when suspended. */
  canWrite: boolean;
  plan: PlanSnapshot | null;
  trialEndsAt: string | null;
  graceEndsAt: string | null;
  suspendedAt: string | null;
  suspensionReason: string | null;
  usage: EntitlementsUsage;
}

/**
 * The per-request guard payload: state and plan features only, no usage counts.
 * One query, memoised on CLS for the lifetime of the request.
 */
export interface TenantAccess {
  state: TenantState;
  canWrite: boolean;
  features: Record<FeatureKey, boolean>;
  trialEndsAt: string | null;
  graceEndsAt: string | null;
  suspendedAt: string | null;
  suspensionReason: string | null;
}
