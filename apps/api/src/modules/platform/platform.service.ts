import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { EntitlementsService } from '../../common/entitlements.service.js';
import { PrismaService } from '../../database/prisma.service.js';

const tenantInclude = {
  subscription: { include: { plan: true } },
  _count: {
    select: {
      students: true,
      teachers: true,
      memberships: true,
      branches: true,
      lessons: true,
    },
  },
} as const;

@Injectable()
export class PlatformService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
  ) {}

  async overview() {
    const [tenants, students, teachers, users, subscriptions] = await Promise.all([
      this.prisma.tenant.findMany({
        select: { id: true, status: true },
      }),
      this.prisma.student.count(),
      this.prisma.teacher.count(),
      this.prisma.user.count(),
      this.prisma.subscription.findMany({
        include: {
          plan: true,
          tenant: {
            select: {
              id: true,
              name: true,
              status: true,
              _count: { select: { memberships: true } },
            },
          },
        },
      }),
    ]);

    const statusCounts = { ACTIVE: 0, TRIAL: 0, SUSPENDED: 0 };
    for (const tenant of tenants) statusCounts[tenant.status] += 1;

    const mrr = subscriptions
      .filter((subscription) => ['ACTIVE', 'TRIALING'].includes(subscription.status))
      .reduce((sum, subscription) => sum + Number(subscription.plan.priceMonthly), 0);

    return {
      totals: {
        tenants: tenants.length,
        activeTenants: statusCounts.ACTIVE,
        trialTenants: statusCounts.TRIAL,
        suspendedTenants: statusCounts.SUSPENDED,
        students,
        teachers,
        users,
        mrr: Math.round(mrr * 100) / 100,
      },
      subscriptions: subscriptions.map((subscription) => ({
        tenantId: subscription.tenant.id,
        tenantName: subscription.tenant.name,
        tenantStatus: subscription.tenant.status,
        status: subscription.status,
        plan: subscription.plan.name,
        priceMonthly: Number(subscription.plan.priceMonthly),
        seatsUsed: subscription.tenant._count.memberships,
        trialEndsAt: subscription.trialEndsAt,
        currentPeriodEnd: subscription.currentPeriodEnd,
      })),
    };
  }

  async listTenants() {
    const tenants = await this.prisma.tenant.findMany({
      include: tenantInclude,
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
    });
    return {
      data: await Promise.all(tenants.map((tenant) => this.toTenantCard(tenant))),
    };
  }

  async getTenant(id: string) {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id },
      include: {
        ...tenantInclude,
        branches: true,
        memberships: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                phone: true,
                locale: true,
                status: true,
                lastLoginAt: true,
              },
            },
            branch: { select: { id: true, name: true } },
          },
          orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
        },
        auditLogs: {
          take: 8,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            action: true,
            entityType: true,
            createdAt: true,
            actorId: true,
          },
        },
      },
    });
    if (!tenant) throw new NotFoundException('Το ωδείο δεν βρέθηκε');
    const snapshot = await this.entitlements.snapshot(id);
    return this.toTenantCard(tenant, snapshot.usage);
  }

  async setTenantStatus(
    id: string,
    dto: { status: 'ACTIVE' | 'SUSPENDED' | 'TRIAL'; reason?: string },
  ) {
    const tenant = await this.prisma.tenant.findFirst({ where: { id } });
    if (!tenant) throw new NotFoundException('Το ωδείο δεν βρέθηκε');

    const updated = await this.prisma.tenant.update({
      where: { id },
      data: {
        status: dto.status,
        suspendedAt: dto.status === 'SUSPENDED' ? new Date() : null,
        suspensionReason: dto.status === 'SUSPENDED' ? (dto.reason ?? null) : null,
      },
      include: tenantInclude,
    });
    return this.toTenantCard(updated);
  }

  async changeTenantPlan(id: string, planCode: string) {
    const [tenant, plan] = await Promise.all([
      this.prisma.tenant.findFirst({ where: { id }, include: tenantInclude }),
      this.prisma.plan.findUnique({ where: { code: planCode } }),
    ]);
    if (!tenant) throw new NotFoundException('Το ωδείο δεν βρέθηκε');
    if (!plan) throw new NotFoundException('Το πρόγραμμα δεν βρέθηκε');

    const usage = (await this.entitlements.snapshot(id)).usage;
    if (usage.students > plan.maxStudents || usage.teachers > plan.maxTeachers) {
      throw new ConflictException({
        code: 'SEAT_LIMIT_BELOW_USAGE',
        message:
          'Το πρόγραμμα δεν επαρκεί για τη σημερινή χρήση. Αφαιρέστε εγγραφές ή επιλέξτε μεγαλύτερο πρόγραμμα.',
        limit: { students: plan.maxStudents, teachers: plan.maxTeachers },
        used: { students: usage.students, teachers: usage.teachers },
      });
    }

    await this.prisma.subscription.upsert({
      where: { tenantId: id },
      create: { tenantId: id, planId: plan.id, status: 'ACTIVE' },
      update: { planId: plan.id },
    });

    const refreshed = await this.prisma.tenant.findFirstOrThrow({
      where: { id },
      include: tenantInclude,
    });
    return this.toTenantCard(refreshed);
  }

  async listOutbox(status?: string, page = 1, pageSize = 25) {
    const where = status ? { status: status as never } : {};
    const [rows, total] = await Promise.all([
      this.prisma.outboxMessage.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.outboxMessage.count({ where }),
    ]);

    return {
      data: rows.map((row) => ({
        id: row.id,
        type: row.type,
        status: row.status,
        attempts: row.attempts,
        lastError: row.lastError,
        createdAt: row.createdAt,
        nextAttemptAt: row.nextAttemptAt,
      })),
      meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    };
  }

  async retryOutbox(id: string) {
    const message = await this.prisma.outboxMessage.findUnique({ where: { id } });
    if (!message) throw new NotFoundException('Το μήνυμα δεν βρέθηκε');
    if (message.status !== 'FAILED') {
      throw new ConflictException({
        code: 'NOT_FAILED',
        message: 'Μόνο αποτυχημένα μηνύματα μπορούν να επαναληφθούν',
      });
    }

    await this.prisma.outboxMessage.update({
      where: { id },
      data: { status: 'PENDING', attempts: 0, nextAttemptAt: new Date(), lockedAt: null },
    });
    return { success: true };
  }

  private async toTenantCard(
    tenant: {
    id: string;
    name: string;
    slug: string;
    status: string;
    createdAt: Date;
    legalName?: string | null;
    taxId?: string | null;
    subscription: {
      status: string;
      trialEndsAt: Date | null;
      currentPeriodEnd: Date | null;
      plan: {
        code: string;
        name: string;
        priceMonthly: unknown;
        maxStudents: number;
        maxTeachers: number;
      };
    } | null;
    _count: {
      students: number;
      teachers: number;
      memberships: number;
      branches: number;
      lessons?: number;
    };
    branches?: unknown;
    auditLogs?: unknown;
    memberships?: {
      id: string;
      role: string;
      isActive: boolean;
      userId: string;
      branch: { id: string; name: string } | null;
      user: {
        id: string;
        email: string;
        firstName: string;
        lastName: string;
        phone: string | null;
        locale: string;
        status: string;
        lastLoginAt: Date | null;
      };
    }[];
    },
    liveUsage?: { students: number; teachers: number },
  ) {
    const maxStudents = tenant.subscription?.plan.maxStudents ?? 0;
    const maxTeachers = tenant.subscription?.plan.maxTeachers ?? 0;
    const members = tenant.memberships?.map((membership) => ({
      id: membership.id,
      role: membership.role,
      isActive: membership.isActive,
      userId: membership.userId,
      branch: membership.branch,
      user: membership.user,
    }));
    const contact =
      members?.find((member) => member.role === 'DIRECTOR') ?? members?.[0] ?? null;
    return {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      status: tenant.status,
      createdAt: tenant.createdAt,
      legalName: tenant.legalName ?? null,
      taxId: tenant.taxId ?? null,
      email: contact?.user.email ?? null,
      phone: contact?.user.phone ?? null,
      plan: tenant.subscription
        ? {
            code: tenant.subscription.plan.code,
            name: tenant.subscription.plan.name,
            priceMonthly: Number(tenant.subscription.plan.priceMonthly),
            status: tenant.subscription.status,
            seatsUsed: tenant._count.memberships,
            trialEndsAt: tenant.subscription.trialEndsAt,
            currentPeriodEnd: tenant.subscription.currentPeriodEnd,
          }
        : null,
      usage: {
        // Live counts exclude soft-deleted rows; `_count` aggregates bypass the
        // Prisma extension and would over-report usage.
        students: liveUsage?.students ?? tenant._count.students,
        teachers: liveUsage?.teachers ?? tenant._count.teachers,
        members: tenant._count.memberships,
        branches: tenant._count.branches,
        lessons: tenant._count.lessons ?? 0,
        maxStudents,
        maxTeachers,
        studentUtilization:
          maxStudents === 0
            ? 0
            : Math.round(
                ((liveUsage?.students ?? tenant._count.students) / maxStudents) * 100,
              ),
        teacherUtilization:
          maxTeachers === 0
            ? 0
            : Math.round(
                ((liveUsage?.teachers ?? tenant._count.teachers) / maxTeachers) * 100,
              ),
      },
      branches: tenant.branches ?? undefined,
      members,
      auditLogs: tenant.auditLogs ?? undefined,
    };
  }
}
