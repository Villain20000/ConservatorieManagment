import { ForbiddenException } from '@nestjs/common';
import { EntitlementsService } from './entitlements.service.js';

const TENANT_ID = 'tenant-1';
const DAY = 24 * 60 * 60 * 1000;

interface PlanFixture {
  code: string;
  name: string;
  maxStudents: number;
  maxTeachers: number;
  features: unknown;
}

const STARTER_PLAN: PlanFixture = {
  code: 'starter',
  name: 'Starter',
  maxStudents: 100,
  maxTeachers: 10,
  features: { finance: true, exams: false, portals: false, multiBranch: false },
};

interface HarnessOptions {
  status?: 'TRIAL' | 'ACTIVE' | 'SUSPENDED';
  trialEndsAt?: Date | null;
  plan?: PlanFixture | null;
  students?: number;
  teachers?: number;
  branches?: number;
  members?: number;
  graceDays?: string;
  suspendedAt?: Date | null;
  suspensionReason?: string | null;
}

function createHarness(options: HarnessOptions = {}) {
  const subscription =
    options.plan === null
      ? null
      : {
          trialEndsAt: options.trialEndsAt ?? null,
          plan: options.plan ?? STARTER_PLAN,
        };

  const tenant = {
    id: TENANT_ID,
    status: options.status ?? 'ACTIVE',
    suspendedAt: options.suspendedAt ?? null,
    suspensionReason: options.suspensionReason ?? null,
    subscription,
  };

  const prisma = {
    tenant: { findUnique: vi.fn().mockResolvedValue(tenant) },
    student: { count: vi.fn().mockResolvedValue(options.students ?? 0) },
    teacher: { count: vi.fn().mockResolvedValue(options.teachers ?? 0) },
    branch: { count: vi.fn().mockResolvedValue(options.branches ?? 0) },
    membership: { count: vi.fn().mockResolvedValue(options.members ?? 0) },
  };

  const config = { get: vi.fn().mockReturnValue(options.graceDays) };
  // No active CLS context in unit tests: the per-request cache is simply bypassed.
  const cls = { isActive: () => false, get: vi.fn(), set: vi.fn() };
  const service = new EntitlementsService(prisma as never, config as never, cls as never);

  return { service, prisma };
}

/**
 * Transaction double that records the order in which statements hit it, so the
 * seat tests can prove the row lock is taken before the count.
 */
function createTx(options: { students?: number; teachers?: number; plan?: object | null } = {}) {
  const order: string[] = [];

  const tx = {
    $queryRaw: vi.fn().mockImplementation(async () => {
      order.push('lock');
      return [{ id: TENANT_ID }];
    }),
    tenant: {
      findUnique: vi.fn().mockResolvedValue({
        subscription:
          options.plan === null ? null : { plan: options.plan ?? { maxStudents: 100, maxTeachers: 10 } },
      }),
    },
    student: {
      count: vi.fn().mockImplementation(async () => {
        order.push('count:students');
        return options.students ?? 0;
      }),
    },
    teacher: {
      count: vi.fn().mockImplementation(async () => {
        order.push('count:teachers');
        return options.teachers ?? 0;
      }),
    },
    branch: { count: vi.fn().mockResolvedValue(0) },
    membership: { count: vi.fn().mockResolvedValue(0) },
  };

  return { tx, order };
}

describe('EntitlementsService.snapshot state machine', () => {
  it('keeps an ACTIVE tenant ACTIVE even when an old trial end is in the past', async () => {
    const { service } = createHarness({
      status: 'ACTIVE',
      trialEndsAt: new Date(Date.now() - 30 * DAY),
    });

    await expect(service.snapshot(TENANT_ID)).resolves.toMatchObject({
      state: 'ACTIVE',
      canWrite: true,
      trialEndsAt: expect.any(String),
    });
  });

  it('reports TRIAL while trialEndsAt is in the future', async () => {
    const trialEndsAt = new Date(Date.now() + 5 * DAY);
    const { service } = createHarness({ status: 'TRIAL', trialEndsAt });

    const snapshot = await service.snapshot(TENANT_ID);

    expect(snapshot.state).toBe('TRIAL');
    expect(snapshot.canWrite).toBe(true);
    expect(snapshot.trialEndsAt).toBe(trialEndsAt.toISOString());
    expect(snapshot.graceEndsAt).toBe(new Date(trialEndsAt.getTime() + 7 * DAY).toISOString());
  });

  it('derives TRIAL_EXPIRED once trialEndsAt has passed', async () => {
    const { service } = createHarness({
      status: 'TRIAL',
      trialEndsAt: new Date(Date.now() - 1 * DAY),
    });

    await expect(service.snapshot(TENANT_ID)).resolves.toMatchObject({
      state: 'TRIAL_EXPIRED',
    });
  });

  it('stays TRIAL_EXPIRED inside the grace window and never writes SUSPENDED itself', async () => {
    const trialEndsAt = new Date(Date.now() - 2 * DAY);
    const { service } = createHarness({ status: 'TRIAL', trialEndsAt });

    const snapshot = await service.snapshot(TENANT_ID);

    expect(snapshot.state).toBe('TRIAL_EXPIRED');
    expect(snapshot.graceEndsAt).toBe(new Date(trialEndsAt.getTime() + 7 * DAY).toISOString());
    expect(snapshot.graceEndsAt! > new Date().toISOString()).toBe(true);
  });

  it('stays TRIAL_EXPIRED after the grace window too (suspension is the job\'s decision)', async () => {
    const { service } = createHarness({
      status: 'TRIAL',
      trialEndsAt: new Date(Date.now() - 30 * DAY),
    });

    await expect(service.snapshot(TENANT_ID)).resolves.toMatchObject({
      state: 'TRIAL_EXPIRED',
      suspendedAt: null,
    });
  });

  it('lets SUSPENDED win over an in-flight trial', async () => {
    const suspendedAt = new Date(Date.now() - 3 * DAY);
    const { service } = createHarness({
      status: 'SUSPENDED',
      trialEndsAt: new Date(Date.now() + 5 * DAY),
      suspendedAt,
      suspensionReason: 'Ανεξόφλητο υπόλοιπο',
    });

    const snapshot = await service.snapshot(TENANT_ID);

    expect(snapshot.state).toBe('SUSPENDED');
    expect(snapshot.suspendedAt).toBe(suspendedAt.toISOString());
    expect(snapshot.suspensionReason).toBe('Ανεξόφλητο υπόλοιπο');
  });
});

describe('EntitlementsService.snapshot writability', () => {
  it('marks TRIAL_EXPIRED as read-only', async () => {
    const { service } = createHarness({
      status: 'TRIAL',
      trialEndsAt: new Date(Date.now() - DAY),
    });

    const snapshot = await service.snapshot(TENANT_ID);

    expect(snapshot.state).toBe('TRIAL_EXPIRED');
    expect(snapshot.canWrite).toBe(false);
  });

  it('marks SUSPENDED as read-only', async () => {
    const { service } = createHarness({ status: 'SUSPENDED' });

    const snapshot = await service.snapshot(TENANT_ID);

    expect(snapshot.state).toBe('SUSPENDED');
    expect(snapshot.canWrite).toBe(false);
  });

  it('keeps TRIAL writable', async () => {
    const { service } = createHarness({
      status: 'TRIAL',
      trialEndsAt: new Date(Date.now() + DAY),
    });

    await expect(service.snapshot(TENANT_ID)).resolves.toMatchObject({
      state: 'TRIAL',
      canWrite: true,
    });
  });
});

describe('EntitlementsService.snapshot usage', () => {
  it('counts only live people and active memberships', async () => {
    const { service, prisma } = createHarness({
      students: 12,
      teachers: 3,
      branches: 2,
      members: 40,
    });

    const snapshot = await service.snapshot(TENANT_ID);

    expect(snapshot.usage).toEqual({ students: 12, teachers: 3, branches: 2, members: 40 });
    expect(prisma.student.count).toHaveBeenCalledWith({
      where: { tenantId: TENANT_ID, deletedAt: null },
    });
    expect(prisma.teacher.count).toHaveBeenCalledWith({
      where: { tenantId: TENANT_ID, deletedAt: null },
    });
    expect(prisma.branch.count).toHaveBeenCalledWith({ where: { tenantId: TENANT_ID } });
    expect(prisma.membership.count).toHaveBeenCalledWith({
      where: { tenantId: TENANT_ID, isActive: true },
    });
  });

  it('reads everything through the caller transaction when one is supplied', async () => {
    const { service, prisma } = createHarness();
    const { tx } = createTx({ students: 4 });

    const snapshot = await service.snapshot(TENANT_ID, tx as never);

    expect(snapshot.usage.students).toBe(4);
    expect(tx.student.count).toHaveBeenCalled();
    expect(prisma.student.count).not.toHaveBeenCalled();
    expect(prisma.tenant.findUnique).not.toHaveBeenCalled();
  });
});

describe('EntitlementsService seat limits', () => {
  it('throws SEAT_LIMIT_REACHED when used equals the plan maximum', async () => {
    const { service } = createHarness();
    const { tx } = createTx({ students: 100, plan: { maxStudents: 100, maxTeachers: 10 } });

    await expect(service.assertCanAddStudent(tx as never, TENANT_ID)).rejects.toMatchObject({
      response: {
        code: 'SEAT_LIMIT_REACHED',
        resource: 'students',
        limit: 100,
        used: 100,
      },
    });
  });

  it('allows the creation while used is below the plan maximum', async () => {
    const { service } = createHarness();
    const { tx } = createTx({ students: 99, plan: { maxStudents: 100, maxTeachers: 10 } });

    await expect(service.assertCanAddStudent(tx as never, TENANT_ID)).resolves.toBeUndefined();
  });

  it('applies the same boundary to teachers', async () => {
    const { service } = createHarness();
    const { tx } = createTx({ teachers: 10, plan: { maxStudents: 100, maxTeachers: 10 } });

    await expect(service.assertCanAddTeacher(tx as never, TENANT_ID)).rejects.toMatchObject({
      response: { code: 'SEAT_LIMIT_REACHED', resource: 'teachers', limit: 10, used: 10 },
    });
  });

  it('locks the tenant row before counting seats', async () => {
    const { service } = createHarness();
    const { tx, order } = createTx({ students: 5, plan: { maxStudents: 100, maxTeachers: 10 } });

    await service.assertCanAddStudent(tx as never, TENANT_ID);

    expect(order).toEqual(['lock', 'count:students']);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(String(tx.$queryRaw.mock.calls[0][0])).toContain('FOR UPDATE');
  });

  it('does not block seats when the tenant has no plan at all', async () => {
    const { service } = createHarness();
    const { tx } = createTx({ students: 500, plan: null });

    await expect(service.assertCanAddStudent(tx as never, TENANT_ID)).resolves.toBeUndefined();
  });
});

describe('EntitlementsService.assertCanAddBranch', () => {
  it('allows the first branch without the multiBranch feature', async () => {
    const { service, prisma } = createHarness({ branches: 0 });

    await expect(service.assertCanAddBranch(TENANT_ID)).resolves.toBeUndefined();
    // The plan is never consulted for the first branch.
    expect(prisma.tenant.findUnique).not.toHaveBeenCalled();
  });

  it('rejects the second branch when the plan lacks multiBranch', async () => {
    const { service } = createHarness({ branches: 1 });

    await expect(service.assertCanAddBranch(TENANT_ID)).rejects.toMatchObject({
      response: { code: 'FEATURE_NOT_IN_PLAN', feature: 'multiBranch' },
    });
  });

  it('allows further branches when the plan has multiBranch', async () => {
    const { service } = createHarness({
      branches: 2,
      plan: { ...STARTER_PLAN, features: { multiBranch: true } },
    });

    await expect(service.assertCanAddBranch(TENANT_ID)).resolves.toBeUndefined();
  });
});

describe('EntitlementsService feature parsing', () => {
  it('degrades a malformed features payload to all-false without throwing', async () => {
    const { service } = createHarness({
      plan: { ...STARTER_PLAN, features: ['not', 'an', 'object'] },
    });

    const snapshot = await service.snapshot(TENANT_ID);

    expect(snapshot.plan?.features).toEqual({
      finance: false,
      exams: false,
      portals: false,
      multiBranch: false,
    });
  });

  it('treats a null features payload and unknown keys as false', async () => {
    const { service } = createHarness({
      plan: { ...STARTER_PLAN, features: { finance: 'yes', unknownModule: true } },
    });

    const snapshot = await service.snapshot(TENANT_ID);

    expect(snapshot.plan?.features).toEqual({
      finance: false,
      exams: false,
      portals: false,
      multiBranch: false,
    });
  });

  it('ignores keys the plan does not mention', async () => {
    const { service } = createHarness({
      plan: { ...STARTER_PLAN, features: { exams: true } },
    });

    const snapshot = await service.snapshot(TENANT_ID);

    expect(snapshot.plan?.features).toEqual({
      finance: false,
      exams: true,
      portals: false,
      multiBranch: false,
    });
  });

  it('returns a null plan when the tenant has no subscription', async () => {
    const { service } = createHarness({ plan: null, status: 'ACTIVE' });

    const snapshot = await service.snapshot(TENANT_ID);

    expect(snapshot.plan).toBeNull();
    expect(snapshot.trialEndsAt).toBeNull();
    expect(snapshot.graceEndsAt).toBeNull();
  });

  it('keeps the core modules open when no plan is assigned at all', async () => {
    const { service } = createHarness({ plan: null });

    await expect(service.requireFeature(TENANT_ID, 'finance')).resolves.toBeUndefined();
    await expect(service.requireFeature(TENANT_ID, 'multiBranch')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});

describe('EntitlementsService.requireFeature', () => {
  it('throws FEATURE_NOT_IN_PLAN naming the missing feature', async () => {
    const { service } = createHarness();

    await expect(service.requireFeature(TENANT_ID, 'exams')).rejects.toMatchObject({
      response: {
        code: 'FEATURE_NOT_IN_PLAN',
        feature: 'exams',
        message: expect.any(String),
      },
    });
  });

  it('passes for a feature the plan includes', async () => {
    const { service } = createHarness();

    await expect(service.requireFeature(TENANT_ID, 'finance')).resolves.toBeUndefined();
  });
});

describe('EntitlementsService.assertWritable', () => {
  it('rejects writes for a suspended tenant', async () => {
    const { service } = createHarness({ status: 'SUSPENDED' });

    await expect(service.assertWritable(TENANT_ID)).rejects.toMatchObject({
      response: { code: 'TENANT_SUSPENDED' },
    });
  });

  it('rejects writes for an expired trial', async () => {
    const { service } = createHarness({
      status: 'TRIAL',
      trialEndsAt: new Date(Date.now() - DAY),
    });

    await expect(service.assertWritable(TENANT_ID)).rejects.toMatchObject({
      response: { code: 'TRIAL_EXPIRED' },
    });
  });

  it('accepts writes for an active tenant', async () => {
    const { service } = createHarness({ status: 'ACTIVE' });

    await expect(service.assertWritable(TENANT_ID)).resolves.toBeUndefined();
  });
});
