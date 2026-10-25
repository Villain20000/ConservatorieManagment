/**
 * EntitlementsService — the single backend source of truth for what a tenant
 * may do. `Tenant.status`, `Subscription.trialEndsAt`, `Plan.maxStudents`,
 * `Plan.maxTeachers` and `Plan.features` are read here and nowhere else.
 *
 * Two deliberate design decisions live in this file:
 *
 * 1. Two read paths, deliberately. `access()` is the per-request guard path: one
 *    query for tenant + subscription + plan, memoised on CLS for the lifetime of
 *    the request. `snapshot()` is the admin path: it adds the four usage counts
 *    and is only called by the tenant/platform settings endpoints. Running the
 *    counts on every authenticated request was measurably too slow (it pushed a
 *    multi-step e2e workflow past its timeout), and the guards never need them.
 *
 * 2. Seat checks are serialised per tenant with a row lock, not Redis.
 *    `assertCanAddStudent` / `assertCanAddTeacher` run inside the caller's
 *    transaction and take `SELECT ... FOR UPDATE` on the tenant row before
 *    counting. Two concurrent "add the 51st student" requests therefore cannot
 *    both observe 50: the second blocks until the first commits and then counts
 *    51. The cost is that all seat-consuming writes for one tenant are
 *    serialised — acceptable, because they are rare, short, and correctness here
 *    is worth more than throughput. The lock is only held for the duration of
 *    the caller's transaction, so the caller must keep that transaction short.
 *
 * State derivation is a pure read: `TRIAL_EXPIRED` is never written back to
 * `Tenant.status`. The daily job is what flips a row to `SUSPENDED`; reading
 * entitlements must never mutate.
 */
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../database/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import type { TenantStatus } from '../generated/prisma/enums.js';
import { FEATURE_KEYS } from './entitlements.types.js';
import type {
  EntitlementsSnapshot,
  EntitlementsUsage,
  FeatureKey,
  PlanSnapshot,
  TenantAccess,
  TenantState,
} from './entitlements.types.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_TRIAL_GRACE_DAYS = 7;

/** Shape we need from `Plan`; kept loose because `features` is `Json?`. */
interface PlanRow {
  code: string;
  name: string;
  maxStudents: number;
  maxTeachers: number;
  features: unknown;
}

interface PlanLimits {
  maxStudents: number;
  maxTeachers: number;
}

const NO_FEATURES: Record<FeatureKey, boolean> = {
  finance: false,
  exams: false,
  portals: false,
  multiBranch: false,
};

/**
 * Used only when the tenant has no subscription/plan at all (platform has not
 * assigned one yet). Locking such a tenant out of its own data would be a
 * deployment footgun, so the core modules stay open and only the paid
 * multi-branch capability stays off. A plan that *exists* is authoritative and
 * gets no such benefit of the doubt.
 */
const FEATURES_WITHOUT_PLAN: Record<FeatureKey, boolean> = {
  finance: true,
  exams: true,
  portals: true,
  multiBranch: false,
};

@Injectable()
export class EntitlementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly cls: ClsService,
  ) {}

  /**
   * The guard path: state plus plan features in **one** query, memoised per
   * request on CLS. `snapshot()` is deliberately not used here because its four
   * count queries would run on every authenticated request.
   */
  async access(tenantId: string): Promise<TenantAccess> {
    const cached = this.readCache(tenantId);
    if (cached) return cached;

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { subscription: { include: { plan: true } } },
    });

    if (!tenant) {
      throw new NotFoundException('Το ωδείο δεν βρέθηκε');
    }

    const now = new Date();
    const trialEndsAt = tenant.subscription?.trialEndsAt ?? null;
    const state = this.deriveState(tenant.status, trialEndsAt, now);
    const graceDays = this.trialGraceDays();

    const access: TenantAccess = {
      state,
      canWrite: state === 'ACTIVE' || state === 'TRIAL',
      features: this.featuresFor(tenant.subscription?.plan ?? null),
      trialEndsAt: trialEndsAt ? trialEndsAt.toISOString() : null,
      graceEndsAt: trialEndsAt
        ? new Date(trialEndsAt.getTime() + graceDays * DAY_MS).toISOString()
        : null,
      suspendedAt: tenant.suspendedAt ? tenant.suspendedAt.toISOString() : null,
      suspensionReason: tenant.suspensionReason ?? null,
    };

    this.writeCache(tenantId, access);
    return access;
  }

  private readCache(tenantId: string): TenantAccess | null {
    try {
      if (!this.cls.isActive()) return null;
      const cached = this.cls.get<{ tenantId: string; value: TenantAccess }>('tenantAccess');
      return cached?.tenantId === tenantId ? cached.value : null;
    } catch {
      return null;
    }
  }

  private writeCache(tenantId: string, value: TenantAccess): void {
    try {
      if (this.cls.isActive()) {
        this.cls.set('tenantAccess', { tenantId, value });
      }
    } catch {
      // A missing cache only costs a query.
    }
  }

  async snapshot(tenantId: string, tx?: Prisma.TransactionClient): Promise<EntitlementsSnapshot> {
    const client = tx ?? this.prisma;

    const tenant = await client.tenant.findUnique({
      where: { id: tenantId },
      include: { subscription: { include: { plan: true } } },
    });

    if (!tenant) {
      throw new NotFoundException('Το ωδείο δεν βρέθηκε');
    }

    const now = new Date();
    const trialEndsAt = tenant.subscription?.trialEndsAt ?? null;
    const plan = tenant.subscription?.plan ?? null;
    const state = this.deriveState(tenant.status, trialEndsAt, now);
    const graceDays = this.trialGraceDays();

    // Counts run on the caller's transaction when one is supplied so that a
    // seat check inside `$transaction` sees rows created earlier in that same
    // transaction instead of a stale pre-commit view.
    const [students, teachers, branches, members] = await Promise.all([
      client.student.count({ where: { tenantId, deletedAt: null } }),
      client.teacher.count({ where: { tenantId, deletedAt: null } }),
      client.branch.count({ where: { tenantId } }),
      client.membership.count({ where: { tenantId, isActive: true } }),
    ]);

    const usage: EntitlementsUsage = { students, teachers, branches, members };

    return {
      state,
      canWrite: state === 'ACTIVE' || state === 'TRIAL',
      plan: plan ? this.toPlanSnapshot(plan) : null,
      trialEndsAt: trialEndsAt ? trialEndsAt.toISOString() : null,
      graceEndsAt: trialEndsAt
        ? new Date(trialEndsAt.getTime() + graceDays * DAY_MS).toISOString()
        : null,
      suspendedAt: tenant.suspendedAt ? tenant.suspendedAt.toISOString() : null,
      suspensionReason: tenant.suspensionReason ?? null,
      usage,
    };
  }

  async requireFeature(tenantId: string, feature: FeatureKey): Promise<void> {
    const access = await this.access(tenantId);

    if (access.features[feature]) {
      return;
    }

    throw new ForbiddenException({
      code: 'FEATURE_NOT_IN_PLAN',
      feature,
      message: 'Η λειτουργία δεν περιλαμβάνεται στο πρόγραμμα του ωδείου',
    });
  }

  /**
   * Must be called with the caller's transaction: the `FOR UPDATE` row lock is
   * only meaningful while that transaction is open, and the count must see the
   * caller's own uncommitted inserts.
   */
  async assertCanAddStudent(tx: Prisma.TransactionClient, tenantId: string): Promise<void> {
    await this.lockTenant(tx, tenantId);

    const limits = await this.loadLimits(tx, tenantId);
    if (!limits) {
      return;
    }

    const used = await tx.student.count({ where: { tenantId, deletedAt: null } });

    if (used >= limits.maxStudents) {
      throw new ForbiddenException({
        code: 'SEAT_LIMIT_REACHED',
        resource: 'students',
        limit: limits.maxStudents,
        used,
        message: `Το πρόγραμμα επιτρέπει έως ${limits.maxStudents} μαθητές`,
      });
    }
  }

  /** See `assertCanAddStudent` — same lock, same reasoning, teachers table. */
  async assertCanAddTeacher(tx: Prisma.TransactionClient, tenantId: string): Promise<void> {
    await this.lockTenant(tx, tenantId);

    const limits = await this.loadLimits(tx, tenantId);
    if (!limits) {
      return;
    }

    const used = await tx.teacher.count({ where: { tenantId, deletedAt: null } });

    if (used >= limits.maxTeachers) {
      throw new ForbiddenException({
        code: 'SEAT_LIMIT_REACHED',
        resource: 'teachers',
        limit: limits.maxTeachers,
        used,
        message: `Το πρόγραμμα επιτρέπει έως ${limits.maxTeachers} καθηγητές`,
      });
    }
  }

  /**
   * The first branch is always allowed — a conservatory with no branch cannot
   * operate at all — so `multiBranch` gates only the second one onwards.
   */
  async assertCanAddBranch(tenantId: string): Promise<void> {
    const existing = await this.prisma.branch.count({ where: { tenantId } });

    if (existing === 0) {
      return;
    }

    const plan = await this.loadPlan(this.prisma, tenantId);

    if (this.featuresFor(plan).multiBranch) {
      return;
    }

    throw new ForbiddenException({
      code: 'FEATURE_NOT_IN_PLAN',
      feature: 'multiBranch',
      message: 'Η λειτουργία δεν περιλαμβάνεται στο πρόγραμμα του ωδείου',
    });
  }

  async assertWritable(tenantId: string): Promise<void> {
    const { state } = await this.snapshot(tenantId);

    if (state === 'SUSPENDED') {
      throw new ForbiddenException({ code: 'TENANT_SUSPENDED' });
    }

    if (state === 'TRIAL_EXPIRED') {
      throw new ForbiddenException({ code: 'TRIAL_EXPIRED' });
    }
  }

  /**
   * `SUSPENDED` is stored and wins over everything. `TRIAL_EXPIRED` is derived
   * and never written back — the grace window below only shapes `graceEndsAt`
   * for messaging; it does not change the state, because the row stays `TRIAL`
   * until the daily job suspends it.
   */
  private deriveState(
    status: TenantStatus,
    trialEndsAt: Date | null,
    now: Date,
  ): TenantState {
    if (status === 'SUSPENDED') {
      return 'SUSPENDED';
    }

    if (status === 'TRIAL') {
      if (trialEndsAt && now.getTime() > trialEndsAt.getTime()) {
        return 'TRIAL_EXPIRED';
      }
      return 'TRIAL';
    }

    return 'ACTIVE';
  }

  private trialGraceDays(): number {
    const raw = this.config.get<string>('TRIAL_GRACE_DAYS');
    if (raw === undefined || raw === null || String(raw).trim() === '') {
      return DEFAULT_TRIAL_GRACE_DAYS;
    }

    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_TRIAL_GRACE_DAYS;
  }

  private toPlanSnapshot(plan: PlanRow): PlanSnapshot {
    return {
      code: plan.code,
      name: plan.name,
      maxStudents: plan.maxStudents,
      maxTeachers: plan.maxTeachers,
      features: this.parseFeatures(plan.features),
    };
  }

  /**
   * `Plan.features` is `Json?` written by hand in seeds and the platform
   * console, so treat it as hostile: anything that is not a JSON object, any
   * missing key and any non-boolean value resolves to `false`. Never throw —
   * a malformed plan must degrade to "no optional modules", not to a 500.
   */
  private parseFeatures(raw: unknown): Record<FeatureKey, boolean> {
    const features: Record<FeatureKey, boolean> = { ...NO_FEATURES };

    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
      return features;
    }

    const record = raw as Record<string, unknown>;
    for (const key of FEATURE_KEYS) {
      features[key] = record[key] === true;
    }

    return features;
  }

  private featuresFor(plan: PlanRow | null): Record<FeatureKey, boolean> {
    return plan ? this.parseFeatures(plan.features) : { ...FEATURES_WITHOUT_PLAN };
  }

  private async loadPlan(
    client: Prisma.TransactionClient,
    tenantId: string,
  ): Promise<PlanRow | null> {
    const tenant = await client.tenant.findUnique({
      where: { id: tenantId },
      select: {
        subscription: {
          select: {
            plan: {
              select: {
                code: true,
                name: true,
                maxStudents: true,
                maxTeachers: true,
                features: true,
              },
            },
          },
        },
      },
    });

    if (!tenant) {
      throw new NotFoundException('Το ωδείο δεν βρέθηκε');
    }

    return tenant.subscription?.plan ?? null;
  }

  private async loadLimits(
    client: Prisma.TransactionClient,
    tenantId: string,
  ): Promise<PlanLimits | null> {
    const tenant = await client.tenant.findUnique({
      where: { id: tenantId },
      select: {
        subscription: {
          select: {
            plan: { select: { maxStudents: true, maxTeachers: true } },
          },
        },
      },
    });

    if (!tenant) {
      throw new NotFoundException('Το ωδείο δεν βρέθηκε');
    }

    return tenant.subscription?.plan ?? null;
  }

  /**
   * Row lock that makes the seat count race-free: concurrent creations for the
   * same tenant queue behind this lock and count committed state. Requires an
   * open transaction — outside one it is a no-op lock released immediately.
   */
  private async lockTenant(tx: Prisma.TransactionClient, tenantId: string): Promise<void> {
    await tx.$queryRaw`SELECT id FROM tenants WHERE id = ${tenantId} FOR UPDATE`;
  }
}
