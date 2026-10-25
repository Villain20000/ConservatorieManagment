import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { formatInTimeZone } from 'date-fns-tz';
import { AuditService } from '../../common/audit.service.js';
import { pageMeta } from '../../common/dto/pagination.dto.js';
import { ScopeService } from '../../common/scope.service.js';
import { TenantContextService } from '../../common/tenant-context.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import type { ChargeStatus } from '../../generated/prisma/enums.js';
import { NumberingService } from '../../infrastructure/numbering/numbering.service.js';
import { OutboxService } from '../../infrastructure/outbox/outbox.service.js';
import { PdfService } from '../../infrastructure/pdf/pdf.service.js';
import {
  CreateChargeDto,
  CreateInstallmentPlanDto,
  CreatePaymentDto,
  CreateScholarshipDto,
  ScholarshipDecision,
  type BulkTuitionDto,
  type ChargeQueryDto,
  type InstallmentPlanQueryDto,
  type PaymentQueryDto,
  type ScholarshipQueryDto,
  type UpdateChargeDto,
} from './dto/finance.dto.js';
import {
  addDaysUtc,
  deriveChargeStatus,
  isInstallmentPlanComplete,
  splitInstallmentAmounts,
  startOfTodayUtc,
} from './finance.rules.js';

const TZ = 'Europe/Athens';

function dateOnly(value: string): Date {
  return new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
}

function euro(cents: number): string {
  return new Intl.NumberFormat('el-GR', { style: 'currency', currency: 'EUR' }).format(
    cents / 100,
  );
}

interface ChargeMoneyShape {
  amountCents: number;
  paidAmountCents: number;
  status: ChargeStatus;
  dueDate: Date;
}

interface PaymentMoneyShape {
  amountCents: number;
  allocations?: Array<{
    charge?: { description: string; period?: string | null } | null;
  }>;
}

function chargeMoneyView<T extends ChargeMoneyShape>(charge: T) {
  const balanceCents = Math.max(0, charge.amountCents - charge.paidAmountCents);
  return {
    ...charge,
    // Display status: past-due charges read as OVERDUE even before the
    // nightly sweep persists the stored status.
    status: deriveChargeStatus(
      charge.status,
      charge.amountCents,
      charge.paidAmountCents,
      charge.dueDate,
    ),
    balanceCents,
    amount: charge.amountCents / 100,
    paidAmount: charge.paidAmountCents / 100,
    balance: balanceCents / 100,
  };
}

function paymentMoneyView<T extends PaymentMoneyShape>(payment: T) {
  const primary = payment.allocations?.[0]?.charge ?? null;
  return {
    ...payment,
    amount: payment.amountCents / 100,
    charge: primary,
  };
}

function deriveStatus(
  current: ChargeStatus,
  amountCents: number,
  paidAmountCents: number,
  dueDate: Date,
): ChargeStatus {
  return deriveChargeStatus(current, amountCents, paidAmountCents, dueDate);
}

@Injectable()
export class FinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: TenantContextService,
    private readonly scope: ScopeService,
    private readonly audit: AuditService,
    private readonly numbering: NumberingService,
    private readonly outbox: OutboxService,
    private readonly pdf: PdfService,
  ) {}

  async overview() {
    const tenantId = this.ctx.tenantId;
    const [charges, payments] = await Promise.all([
      this.prisma.charge.findMany({
        where: { tenantId, status: { not: 'CANCELLED' } },
        select: {
          amountCents: true,
          paidAmountCents: true,
          dueDate: true,
          studentId: true,
        },
      }),
      this.prisma.payment.findMany({
        where: { tenantId, status: 'POSTED' },
        select: { amountCents: true, paidAt: true },
      }),
    ]);

    let billedCents = 0;
    let outstandingCents = 0;
    let overdueCents = 0;
    const balances = new Map<string, number>();
    const monthly = new Map<string, { billedCents: number; collectedCents: number }>();

    for (const charge of charges) {
      const balance = Math.max(0, charge.amountCents - charge.paidAmountCents);
      billedCents += charge.amountCents;
      outstandingCents += balance;
      if (balance > 0 && charge.dueDate < startOfTodayUtc()) overdueCents += balance;
      if (balance > 0) {
        balances.set(charge.studentId, (balances.get(charge.studentId) ?? 0) + balance);
      }
      const key = charge.dueDate.toISOString().slice(0, 7);
      const bucket = monthly.get(key) ?? { billedCents: 0, collectedCents: 0 };
      bucket.billedCents += charge.amountCents;
      monthly.set(key, bucket);
    }

    let collectedCents = 0;
    for (const payment of payments) {
      collectedCents += payment.amountCents;
      const key = formatInTimeZone(payment.paidAt, TZ, 'yyyy-MM');
      const bucket = monthly.get(key) ?? { billedCents: 0, collectedCents: 0 };
      bucket.collectedCents += payment.amountCents;
      monthly.set(key, bucket);
    }

    const topDebtors = [...balances.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    const topDebtorStudents = await this.prisma.student.findMany({
      where: { tenantId, id: { in: topDebtors.map(([id]) => id) } },
      select: { id: true, firstName: true, lastName: true, registrationNumber: true },
    });
    const studentById = new Map(topDebtorStudents.map((student) => [student.id, student]));

    const recentPayments = await this.prisma.payment.findMany({
      where: { tenantId },
      include: {
        student: { select: { id: true, firstName: true, lastName: true } },
        allocations: {
          include: { charge: { select: { id: true, description: true } } },
        },
      },
      orderBy: { paidAt: 'desc' },
      take: 6,
    });

    const keys = [...monthly.keys()].sort();
    return {
      totals: {
        billedCents,
        collectedCents,
        outstandingCents,
        overdueCents,
        collectionRate:
          billedCents === 0 ? 0 : Math.round((collectedCents / billedCents) * 100),
        studentsWithBalance: balances.size,
        billed: billedCents / 100,
        collected: collectedCents / 100,
        outstanding: outstandingCents / 100,
        overdue: overdueCents / 100,
      },
      monthly: keys.map((key) => {
        const bucket = monthly.get(key);
        const billedCents = bucket?.billedCents ?? 0;
        const collectedCents = bucket?.collectedCents ?? 0;
        return {
          month: key,
          billedCents,
          collectedCents,
          billed: billedCents / 100,
          collected: collectedCents / 100,
        };
      }),
      topDebtors: topDebtors.map(([studentId, balanceCents]) => ({
        studentId,
        balanceCents,
        balance: balanceCents / 100,
        student: studentById.get(studentId) ?? null,
      })),
      recentPayments: recentPayments.map((payment) => paymentMoneyView(payment)),
    };
  }

  async listCharges(query: ChargeQueryDto) {
    const where: Prisma.ChargeWhereInput = { tenantId: this.ctx.tenantId };
    if (query.studentId) where.studentId = query.studentId;
    if (query.origin) where.origin = query.origin;
    if (query.status === 'OVERDUE') {
      // Match live overdue charges even when the stored status is still
      // PENDING/PARTIAL (the sweep persists OVERDUE asynchronously).
      const today = startOfTodayUtc();
      const cap = query.to ? dateOnly(query.to) : today;
      where.status = { in: ['PENDING', 'PARTIAL', 'OVERDUE'] };
      where.dueDate = {
        ...(query.from ? { gte: dateOnly(query.from) } : {}),
        lt: cap < today ? cap : today,
      };
    } else {
      if (query.status) where.status = query.status;
      if (query.from || query.to) {
        where.dueDate = {
          ...(query.from ? { gte: dateOnly(query.from) } : {}),
          ...(query.to ? { lte: dateOnly(query.to) } : {}),
        };
      }
    }
    if (query.search) {
      where.OR = [
        { description: { contains: query.search, mode: 'insensitive' } },
        { student: { firstName: { contains: query.search, mode: 'insensitive' } } },
        { student: { lastName: { contains: query.search, mode: 'insensitive' } } },
        { student: { registrationNumber: { contains: query.search, mode: 'insensitive' } } },
      ];
    }
    const [total, data] = await Promise.all([
      this.prisma.charge.count({ where }),
      this.prisma.charge.findMany({
        where,
        include: {
          student: {
            select: { id: true, firstName: true, lastName: true, registrationNumber: true },
          },
          scholarship: { select: { id: true, type: true, percentage: true, amountCents: true } },
        },
        orderBy: [{ dueDate: 'desc' }, { createdAt: 'desc' }],
        skip: query.skip,
        take: query.pageSize,
      }),
    ]);
    return {
      data: data.map((charge) => chargeMoneyView(charge)),
      meta: pageMeta(total, query.page, query.pageSize),
    };
  }

  async createCharge(dto: CreateChargeDto) {
    const tenantId = this.ctx.tenantId;
    await this.requireStudent(dto.studentId);

    let discountAmountCents = dto.discountAmountCents ?? 0;
    let discountReason = dto.discountReason ?? null;
    let scholarshipId: string | null = null;

    if (dto.scholarshipId) {
      const scholarship = await this.prisma.scholarship.findFirst({
        where: { id: dto.scholarshipId, tenantId },
      });
      if (!scholarship) throw new NotFoundException('Η υποτροφία δεν βρέθηκε');
      if (scholarship.status !== 'APPROVED') {
        throw new BadRequestException({
          code: 'SCHOLARSHIP_NOT_APPROVED',
          message: 'Η υποτροφία δεν είναι εγκεκριμένη',
        });
      }
      if (scholarship.studentId !== dto.studentId) {
        throw new BadRequestException('Η υποτροφία ανήκει σε άλλον μαθητή');
      }
      const today = startOfTodayUtc();
      if (scholarship.validFrom > today || (scholarship.validTo && scholarship.validTo < today)) {
        throw new BadRequestException({
          code: 'SCHOLARSHIP_NOT_ACTIVE',
          message: 'Η υποτροφία δεν βρίσκεται σε ισχύ',
        });
      }
      discountAmountCents =
        scholarship.type === 'PERCENTAGE'
          ? Math.floor((dto.amountCents * (scholarship.percentage ?? 0)) / 100)
          : (scholarship.amountCents ?? 0);
      discountReason = scholarship.reason ?? 'Υποτροφία';
      scholarshipId = scholarship.id;
    }

    discountAmountCents = Math.min(discountAmountCents, dto.amountCents);
    const amountCents = dto.amountCents - discountAmountCents;
    const dueDate = dateOnly(dto.dueDate);

    const charge = await this.prisma.charge.create({
      data: {
        tenantId,
        studentId: dto.studentId,
        description: dto.description,
        period: dto.period ?? null,
        amountCents,
        grossAmountCents: dto.amountCents,
        discountAmountCents,
        discountReason,
        scholarshipId,
        origin: dto.origin ?? 'TUITION',
        enrollmentId: dto.enrollmentId ?? null,
        dueDate,
        status: deriveStatus('PENDING', amountCents, 0, dueDate),
        createdById: this.ctx.userId,
      },
    });
    await this.audit.record('charge.created', 'Charge', charge.id, {
      amountCents,
      studentId: dto.studentId,
    });
    return charge;
  }

  async updateCharge(id: string, dto: UpdateChargeDto) {
    const tenantId = this.ctx.tenantId;
    const charge = await this.prisma.charge.findFirst({ where: { id, tenantId } });
    if (!charge) throw new NotFoundException('Η χρέωση δεν βρέθηκε');
    if (charge.status === 'CANCELLED') {
      throw new ConflictException({ code: 'CHARGE_CANCELLED', message: 'Η χρέωση έχει ακυρωθεί' });
    }

    const gross = dto.amountCents ?? charge.grossAmountCents;
    const amountCents = Math.max(0, gross - charge.discountAmountCents);
    if (amountCents < charge.paidAmountCents) {
      throw new BadRequestException({
        code: 'CHARGE_BELOW_PAID_AMOUNT',
        message: 'Το ποσό δεν μπορεί να είναι μικρότερο από τις καταχωρισμένες πληρωμές',
      });
    }
    const dueDate = dto.dueDate ? dateOnly(dto.dueDate) : charge.dueDate;

    const updated = await this.prisma.charge.update({
      where: { id },
      data: {
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.period !== undefined ? { period: dto.period } : {}),
        grossAmountCents: gross,
        amountCents,
        dueDate,
        status: deriveStatus(charge.status, amountCents, charge.paidAmountCents, dueDate),
      },
    });
    await this.audit.record('charge.updated', 'Charge', id, {
      before: { amountCents: charge.amountCents, dueDate: charge.dueDate },
      after: { amountCents, dueDate },
    });
    return updated;
  }

  async cancelCharge(id: string, reason?: string) {
    const charge = await this.prisma.charge.findFirst({
      where: { id, tenantId: this.ctx.tenantId },
    });
    if (!charge) throw new NotFoundException('Η χρέωση δεν βρέθηκε');
    if (charge.status === 'CANCELLED') {
      throw new ConflictException({ code: 'CHARGE_ALREADY_CANCELLED', message: 'Η χρέωση έχει ήδη ακυρωθεί' });
    }
    if (charge.paidAmountCents > 0) {
      throw new BadRequestException({
        code: 'CHARGE_HAS_PAYMENTS',
        message: 'Ακυρώστε πρώτα τις σχετικές πληρωμές',
      });
    }
    const updated = await this.prisma.charge.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelledById: this.ctx.userId,
        cancellationReason: reason ?? null,
      },
    });
    await this.audit.record('charge.cancelled', 'Charge', id, { reason: reason ?? null });
    return updated;
  }

  /**
   * Undo for a mis-clicked cancellation. Status is recomputed from what has
   * actually been paid rather than restored from a stored snapshot.
   */
  async reopenCharge(id: string) {
    const charge = await this.prisma.charge.findFirst({
      where: { id, tenantId: this.ctx.tenantId },
    });
    if (!charge) throw new NotFoundException('Η χρέωση δεν βρέθηκε');
    if (charge.status !== 'CANCELLED') {
      throw new ConflictException({
        code: 'CHARGE_NOT_CANCELLED',
        message: 'Η χρέωση δεν είναι ακυρωμένη',
      });
    }

    const status =
      charge.paidAmountCents <= 0
        ? 'PENDING'
        : charge.paidAmountCents >= charge.amountCents
          ? 'PAID'
          : 'PARTIAL';

    const updated = await this.prisma.charge.update({
      where: { id },
      data: {
        status,
        cancelledAt: null,
        cancelledById: null,
        cancellationReason: null,
      },
    });
    await this.audit.record('charge.reopened', 'Charge', id, { status });
    return updated;
  }

  async bulkTuition(dto: BulkTuitionDto) {
    const tenantId = this.ctx.tenantId;
    const enrollments = await this.prisma.enrollment.findMany({
      where: {
        tenantId,
        status: 'ACTIVE',
        ...(dto.academicYearId ? { academicYearId: dto.academicYearId } : {}),
      },
      include: { program: { select: { name: true, defaultFeeCents: true } } },
    });

    const dueDate = dateOnly(dto.dueDate);
    const rows = enrollments
      .map((enrollment) => {
        const amountCents = dto.amountCents ?? enrollment.program.defaultFeeCents;
        if (!amountCents || amountCents <= 0) return null;
        return {
          tenantId,
          studentId: enrollment.studentId,
          enrollmentId: enrollment.id,
          description: `Δίδακτρα ${enrollment.program.name} — ${dto.period}`,
          period: dto.period,
          amountCents,
          grossAmountCents: amountCents,
          origin: 'TUITION' as const,
          dueDate,
          status: deriveStatus('PENDING', amountCents, 0, dueDate),
          sourceKey: `tuition:${enrollment.id}:${dto.period}:1`,
          createdById: this.ctx.userId,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);

    const result = rows.length
      ? await this.prisma.charge.createMany({ data: rows, skipDuplicates: true })
      : { count: 0 };
    await this.audit.record('charge.bulk_tuition', 'Charge', null, {
      period: dto.period,
      created: result.count,
    });
    return {
      created: result.count,
      skipped: rows.length - result.count,
      enrollmentsWithoutFee: enrollments.length - rows.length,
      eligibleEnrollments: enrollments.length,
    };
  }

  async listInstallmentPlans(query: InstallmentPlanQueryDto) {
    const where: Prisma.InstallmentPlanWhereInput = { tenantId: this.ctx.tenantId };
    if (query.studentId) where.studentId = query.studentId;
    const [total, data] = await Promise.all([
      this.prisma.installmentPlan.count({ where }),
      this.prisma.installmentPlan.findMany({
        where,
        include: {
          student: { select: { id: true, firstName: true, lastName: true } },
          charges: { orderBy: { installmentNo: 'asc' } },
        },
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.pageSize,
      }),
    ]);
    return { data, meta: pageMeta(total, query.page, query.pageSize) };
  }

  async createInstallmentPlan(dto: CreateInstallmentPlanDto) {
    const tenantId = this.ctx.tenantId;
    await this.requireStudent(dto.studentId);
    const startDate = dateOnly(dto.startDate);
    const intervalDays = dto.intervalDays ?? 30;
    let amounts: number[];
    try {
      amounts = splitInstallmentAmounts(dto.totalAmountCents, dto.count);
    } catch {
      throw new BadRequestException({
        code: 'INSTALLMENT_AMOUNT_TOO_LOW',
        message: 'Το συνολικό ποσό πρέπει να καλύπτει τουλάχιστον ένα λεπτό ανά δόση',
      });
    }

    const plan = await this.prisma.$transaction(async (tx) => {
      const created = await tx.installmentPlan.create({
        data: {
          tenantId,
          studentId: dto.studentId,
          enrollmentId: dto.enrollmentId ?? null,
          count: dto.count,
          startDate,
          intervalDays,
          totalAmountCents: dto.totalAmountCents,
        },
      });
      await tx.charge.createMany({
        data: Array.from({ length: dto.count }, (_, index) => {
          const amountCents = amounts[index];
          const dueDate = addDaysUtc(startDate, index * intervalDays);
          return {
            tenantId,
            studentId: dto.studentId,
            enrollmentId: dto.enrollmentId ?? null,
            description: `${dto.description} (${index + 1}/${dto.count})`,
            amountCents,
            grossAmountCents: amountCents,
            origin: 'TUITION' as const,
            installmentPlanId: created.id,
            installmentNo: index + 1,
            installmentCount: dto.count,
            dueDate,
            status: deriveStatus('PENDING', amountCents, 0, dueDate),
            sourceKey: `installment:${created.id}:${index + 1}`,
            createdById: this.ctx.userId,
          };
        }),
      });
      return tx.installmentPlan.findUniqueOrThrow({
        where: { id: created.id },
        include: { charges: { orderBy: { installmentNo: 'asc' } } },
      });
    });
    await this.audit.record('installment_plan.created', 'InstallmentPlan', plan.id, {
      count: dto.count,
      totalAmountCents: dto.totalAmountCents,
    });
    return plan;
  }

  async cancelInstallmentPlan(id: string, reason?: string) {
    const tenantId = this.ctx.tenantId;
    const plan = await this.prisma.installmentPlan.findFirst({
      where: { id, tenantId },
      include: { charges: true },
    });
    if (!plan) throw new NotFoundException('Το πλάνο δόσεων δεν βρέθηκε');
    if (plan.status !== 'ACTIVE') {
      throw new ConflictException({
        code: 'INSTALLMENT_PLAN_NOT_ACTIVE',
        message: 'Το πλάνο δόσεων δεν είναι ενεργό',
      });
    }
    if (plan.charges.some((charge) => charge.paidAmountCents > 0)) {
      throw new BadRequestException({
        code: 'INSTALLMENT_HAS_PAYMENTS',
        message: 'Το πλάνο έχει δόσεις με καταχωρισμένες πληρωμές',
      });
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.charge.updateMany({
        where: { installmentPlanId: id, status: { not: 'CANCELLED' } },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancelledById: this.ctx.userId,
          cancellationReason: reason ?? 'Ακύρωση πλάνου δόσεων',
        },
      });
      return tx.installmentPlan.update({
        where: { id },
        data: { status: 'CANCELLED' },
        include: { charges: { orderBy: { installmentNo: 'asc' } } },
      });
    });
    await this.audit.record('installment_plan.cancelled', 'InstallmentPlan', id, {
      reason: reason ?? null,
    });
    return updated;
  }

  async listScholarships(query: ScholarshipQueryDto) {
    const where: Prisma.ScholarshipWhereInput = { tenantId: this.ctx.tenantId };
    if (query.studentId) where.studentId = query.studentId;
    const [total, data] = await Promise.all([
      this.prisma.scholarship.count({ where }),
      this.prisma.scholarship.findMany({
        where,
        include: {
          student: {
            select: { id: true, firstName: true, lastName: true, registrationNumber: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.pageSize,
      }),
    ]);
    return { data, meta: pageMeta(total, query.page, query.pageSize) };
  }

  async createScholarship(dto: CreateScholarshipDto) {
    await this.requireStudent(dto.studentId);
    if (dto.type === 'PERCENTAGE' && !dto.percentage) {
      throw new BadRequestException('Απαιτείται ποσοστό για ποσοστιαία υποτροφία');
    }
    if (dto.type === 'FIXED' && !dto.amountCents) {
      throw new BadRequestException('Απαιτείται ποσό για υποτροφία σταθερού ποσού');
    }
    const start = dateOnly(dto.validFrom);
    const end = dto.validTo ? dateOnly(dto.validTo) : null;
    if (end && end < start) {
      throw new BadRequestException('Η ημερομηνία λήξης προηγείται της έναρξης');
    }
    const scholarship = await this.prisma.scholarship.create({
      data: {
        tenantId: this.ctx.tenantId,
        studentId: dto.studentId,
        type: dto.type,
        percentage: dto.percentage ?? null,
        amountCents: dto.amountCents ?? null,
        reason: dto.reason ?? null,
        validFrom: start,
        validTo: end,
      },
    });
    await this.audit.record('scholarship.created', 'Scholarship', scholarship.id);
    return scholarship;
  }

  async decideScholarship(id: string, status: ScholarshipDecision) {
    const scholarship = await this.prisma.scholarship.findFirst({
      where: { id, tenantId: this.ctx.tenantId },
    });
    if (!scholarship) throw new NotFoundException('Η υποτροφία δεν βρέθηκε');
    if (scholarship.status !== 'PENDING') {
      throw new ConflictException({
        code: 'SCHOLARSHIP_ALREADY_DECIDED',
        message: 'Η υποτροφία έχει ήδη αξιολογηθεί',
      });
    }
    if (
      status === ScholarshipDecision.APPROVED &&
      scholarship.validTo &&
      scholarship.validTo < startOfTodayUtc()
    ) {
      throw new BadRequestException({
        code: 'SCHOLARSHIP_EXPIRED',
        message: 'Η υποτροφία έχει λήξει και δεν μπορεί να εγκριθεί',
      });
    }
    const updated = await this.prisma.scholarship.update({
      where: { id },
      data: {
        status,
        approvedById: this.ctx.userId,
        approvedAt: new Date(),
      },
    });
    await this.audit.record(`scholarship.${status.toLowerCase()}`, 'Scholarship', id);
    return updated;
  }

  async listPayments(query: PaymentQueryDto) {
    const where: Prisma.PaymentWhereInput = { tenantId: this.ctx.tenantId };
    if (query.studentId) where.studentId = query.studentId;
    if (query.method) where.method = query.method;
    if (query.status) where.status = query.status;
    if (query.from || query.to) {
      where.paidAt = {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lte: new Date(query.to) } : {}),
      };
    }
    if (query.search) {
      where.OR = [
        { receiptNumber: { contains: query.search, mode: 'insensitive' } },
        { reference: { contains: query.search, mode: 'insensitive' } },
        { student: { firstName: { contains: query.search, mode: 'insensitive' } } },
        { student: { lastName: { contains: query.search, mode: 'insensitive' } } },
        { student: { registrationNumber: { contains: query.search, mode: 'insensitive' } } },
      ];
    }
    const [total, data] = await Promise.all([
      this.prisma.payment.count({ where }),
      this.prisma.payment.findMany({
        where,
        include: {
          student: {
            select: { id: true, firstName: true, lastName: true, registrationNumber: true },
          },
          allocations: {
            include: { charge: { select: { id: true, description: true, period: true } } },
          },
        },
        orderBy: { paidAt: 'desc' },
        skip: query.skip,
        take: query.pageSize,
      }),
    ]);
    return {
      data: data.map((payment) => paymentMoneyView(payment)),
      meta: pageMeta(total, query.page, query.pageSize),
    };
  }

  async recordPayment(dto: CreatePaymentDto) {
    const tenantId = this.ctx.tenantId;
    const student = await this.prisma.student.findFirst({
      where: { id: dto.studentId, tenantId },
      include: {
        user: { select: { id: true, email: true } },
        guardians: {
          select: {
            guardian: {
              select: { userId: true, email: true, user: { select: { email: true } } },
            },
          },
        },
      },
    });
    if (!student) throw new NotFoundException('Ο μαθητής δεν βρέθηκε');

    const payment = await this.prisma.$transaction(async (tx) => {
      if (dto.allocations?.length) {
        const ids = dto.allocations.map((allocation) => allocation.chargeId);
        if (new Set(ids).size !== ids.length) {
          throw new BadRequestException('Υπάρχουν διπλές κατανομές για την ίδια χρέωση');
        }
      }

      const openCharges = await tx.charge.findMany({
        where: {
          tenantId,
          studentId: dto.studentId,
          status: { notIn: ['CANCELLED', 'PAID'] },
          ...(dto.allocations ? { id: { in: dto.allocations.map((a) => a.chargeId) } } : {}),
        },
        orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
      });

      if (dto.allocations) {
        const found = new Set(openCharges.map((charge) => charge.id));
        for (const allocation of dto.allocations) {
          if (!found.has(allocation.chargeId)) {
            throw new NotFoundException('Η χρέωση δεν βρέθηκε ή έχει εξοφληθεί');
          }
        }
      }

      if (openCharges.length) {
        await tx.$queryRaw`
          SELECT "id" FROM "charges"
          WHERE "id" = ANY(${openCharges.map((charge) => charge.id)}::uuid[])
          FOR UPDATE
        `;
      }

      const balanceByCharge = new Map(
        openCharges.map((charge) => [
          charge.id,
          Math.max(0, charge.amountCents - charge.paidAmountCents),
        ]),
      );

      let plan: Array<{ chargeId: string; amountCents: number }>;
      if (dto.allocations) {
        let total = 0;
        for (const allocation of dto.allocations) {
          const balance = balanceByCharge.get(allocation.chargeId) ?? 0;
          if (allocation.amountCents > balance) {
            throw new BadRequestException({
              code: 'FINANCE_ALLOCATION_EXCEEDS_BALANCE',
              message: 'Η κατανομή υπερβαίνει το υπόλοιπο της χρέωσης',
            });
          }
          total += allocation.amountCents;
        }
        if (total !== dto.amountCents) {
          throw new BadRequestException({
            code: 'FINANCE_ALLOCATION_MISMATCH',
            message: 'Το άθροισμα των κατανομών δεν συμπίπτει με το ποσό πληρωμής',
          });
        }
        plan = dto.allocations.map((allocation) => ({
          chargeId: allocation.chargeId,
          amountCents: allocation.amountCents,
        }));
      } else {
        let remaining = dto.amountCents;
        plan = [];
        for (const charge of openCharges) {
          if (remaining <= 0) break;
          const balance = balanceByCharge.get(charge.id) ?? 0;
          if (balance <= 0) continue;
          const amount = Math.min(balance, remaining);
          plan.push({ chargeId: charge.id, amountCents: amount });
          remaining -= amount;
        }
        if (remaining > 0) {
          throw new BadRequestException({
            code: 'FINANCE_PAYMENT_EXCEEDS_BALANCE',
            message: 'Το ποσό υπερβαίνει το συνολικό υπόλοιπο του μαθητή',
          });
        }
      }

      const receiptNumber = await this.numbering.nextReceipt(tx);
      const created = await tx.payment.create({
        data: {
          tenantId,
          studentId: dto.studentId,
          receiptNumber,
          amountCents: dto.amountCents,
          method: dto.method ?? 'CASH',
          paidAt: dto.paidAt ? new Date(dto.paidAt) : new Date(),
          reference: dto.reference ?? null,
          notes: dto.notes ?? null,
          recordedById: this.ctx.userId,
        },
      });

      await tx.paymentAllocation.createMany({
        data: plan.map((allocation) => ({
          tenantId,
          paymentId: created.id,
          chargeId: allocation.chargeId,
          amountCents: allocation.amountCents,
        })),
      });

      for (const chargeId of new Set(plan.map((allocation) => allocation.chargeId))) {
        await this.recalculateCharge(tx, chargeId);
      }

      const guardianUserIds = student.guardians
        .map((link) => link.guardian.userId)
        .filter((value): value is string => Boolean(value));
      const recipientIds = [...new Set([student.user?.id, ...guardianUserIds].filter(Boolean))] as string[];
      if (recipientIds.length) {
        await tx.notification.createMany({
          data: recipientIds.map((userId) => ({
            tenantId,
            userId,
            type: 'PAYMENT_RECEIVED' as const,
            title: 'Καταχώριση πληρωμής',
            body: `Η πληρωμή ${receiptNumber} ύψους ${euro(dto.amountCents)} καταχωρίστηκε.`,
            entityType: 'Payment',
            entityId: created.id,
            dedupeKey: `payment:${created.id}`,
          })),
          skipDuplicates: true,
        });
      }

      const emails = [
        student.email,
        student.user?.email,
        ...student.guardians.map((link) => link.guardian.email ?? link.guardian.user?.email),
      ].filter((value): value is string => Boolean(value));
      for (const email of [...new Set(emails)]) {
        await this.outbox.enqueue(
          {
            type: 'email',
            dedupeKey: `receipt-email:${created.id}:${email}`,
            payload: {
              to: email,
              subject: `Απόδειξη είσπραξης ${receiptNumber}`,
              text: `Καταχωρίστηκε πληρωμή ύψους ${euro(dto.amountCents)} για τον/την ${student.firstName} ${student.lastName}. Αρ. απόδειξης: ${receiptNumber}.`,
            },
          },
          tx,
        );
      }

      return tx.payment.findUniqueOrThrow({
        where: { id: created.id },
        include: {
          allocations: {
            include: { charge: { select: { id: true, description: true, period: true } } },
          },
          student: { select: { id: true, firstName: true, lastName: true } },
        },
      });
    });

    await this.audit.record('payment.recorded', 'Payment', payment.id, {
      receiptNumber: payment.receiptNumber,
      amountCents: payment.amountCents,
      allocations: payment.allocations.length,
    });
    return paymentMoneyView(payment);
  }

  async voidPayment(id: string, reason: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { id, tenantId: this.ctx.tenantId },
      include: { allocations: true },
    });
    if (!payment) throw new NotFoundException('Η πληρωμή δεν βρέθηκε');
    if (payment.status === 'VOIDED') {
      throw new ConflictException({ code: 'PAYMENT_ALREADY_VOIDED', message: 'Η πληρωμή έχει ήδη ακυρωθεί' });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.payment.update({
        where: { id },
        data: {
          status: 'VOIDED',
          voidedAt: new Date(),
          voidedById: this.ctx.userId,
          voidReason: reason,
        },
      });
      for (const chargeId of new Set(payment.allocations.map((allocation) => allocation.chargeId))) {
        await this.recalculateCharge(tx, chargeId);
      }
      return result;
    });

    await this.audit.record('payment.voided', 'Payment', id, {
      receiptNumber: payment.receiptNumber,
      amountCents: payment.amountCents,
      reason,
    });
    return updated;
  }

  /**
   * Undo for a voided payment. Re-adding the allocations must not push any charge
   * above its face value — that is the one case where reopening would corrupt the
   * ledger, so it is refused rather than silently clamped.
   */
  async reopenPayment(id: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { id, tenantId: this.ctx.tenantId },
      include: { allocations: true },
    });
    if (!payment) throw new NotFoundException('Η πληρωμή δεν βρέθηκε');
    if (payment.status !== 'VOIDED') {
      throw new ConflictException({
        code: 'PAYMENT_NOT_VOIDED',
        message: 'Η πληρωμή δεν είναι ακυρωμένη',
      });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      for (const allocation of payment.allocations) {
        const charge = await tx.charge.findFirst({
          where: { id: allocation.chargeId, tenantId: this.ctx.tenantId },
        });
        if (!charge) continue;
        if (
          charge.status === 'CANCELLED' ||
          charge.paidAmountCents + allocation.amountCents > charge.amountCents
        ) {
          throw new ConflictException({
            code: 'CHARGE_WOULD_BE_OVERPAID',
            message:
              'Η επαναφορά της πληρωμής θα υπερκάλυπτε χρέωση. Ελέγξτε τις σχετικές χρεώσεις.',
          });
        }
      }

      const result = await tx.payment.update({
        where: { id },
        data: { status: 'POSTED', voidedAt: null, voidedById: null, voidReason: null },
      });
      for (const chargeId of new Set(payment.allocations.map((allocation) => allocation.chargeId))) {
        await this.recalculateCharge(tx, chargeId);
      }
      return result;
    });

    await this.audit.record('payment.reopened', 'Payment', id, {
      receiptNumber: payment.receiptNumber,
      amountCents: payment.amountCents,
    });
    return updated;
  }

  async studentLedger(studentId: string) {
    await this.scope.assertStudentAccessible(studentId);
    const tenantId = this.ctx.tenantId;
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, tenantId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        registrationNumber: true,
      },
    });
    if (!student) return null;

    const [charges, payments] = await Promise.all([
      this.prisma.charge.findMany({
        where: { tenantId, studentId },
        include: {
          allocations: {
            include: {
              payment: {
                select: { id: true, receiptNumber: true, status: true, paidAt: true },
              },
            },
          },
        },
        orderBy: { dueDate: 'desc' },
      }),
      this.prisma.payment.findMany({
        where: { tenantId, studentId },
        include: {
          allocations: { include: { charge: { select: { description: true, period: true } } } },
        },
        orderBy: { paidAt: 'desc' },
      }),
    ]);

    let billedCents = 0;
    let outstandingCents = 0;
    const entries = charges.map((charge) => {
      if (charge.status !== 'CANCELLED') {
        billedCents += charge.amountCents;
        outstandingCents += Math.max(0, charge.amountCents - charge.paidAmountCents);
      }
      return {
        ...charge,
        balanceCents: Math.max(0, charge.amountCents - charge.paidAmountCents),
      };
    });
    const collectedCents = payments
      .filter((payment) => payment.status === 'POSTED')
      .reduce((sum, payment) => sum + payment.amountCents, 0);

    return {
      student,
      summary: {
        billedCents,
        collectedCents,
        outstandingCents,
        billed: billedCents / 100,
        collected: collectedCents / 100,
        outstanding: outstandingCents / 100,
      },
      charges: entries.map((charge) => chargeMoneyView(charge)),
      payments: payments.map((payment) => paymentMoneyView(payment)),
    };
  }

  async paymentReceipt(id: string) {
    const tenantId = this.ctx.tenantId;
    const [payment, tenant] = await Promise.all([
      this.prisma.payment.findFirst({
        where: { id, tenantId },
        include: {
          student: {
            select: {
              firstName: true,
              lastName: true,
              registrationNumber: true,
              birthDate: true,
              branch: { select: { name: true } },
            },
          },
          allocations: {
            include: { charge: { select: { description: true, period: true } } },
          },
        },
      }),
      this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { name: true, legalName: true },
      }),
    ]);
    if (!payment) throw new NotFoundException('Η πληρωμή δεν βρέθηκε');

    const buffer = await this.pdf.render('payment-receipt.v1', {
      tenant: { name: tenant?.name ?? '', legalName: tenant?.legalName },
      student: {
        firstName: payment.student.firstName,
        lastName: payment.student.lastName,
        registrationNumber: payment.student.registrationNumber,
        birthDate: payment.student.birthDate?.toISOString() ?? null,
        branch: payment.student.branch?.name ?? null,
      },
      protocolNumber: payment.receiptNumber,
      issuedAt: payment.paidAt,
      watermark: false,
      data: {
        receiptNumber: payment.receiptNumber,
        amountCents: payment.amountCents,
        method: payment.method,
        paidAt: payment.paidAt,
        reference: payment.reference,
        voided: payment.status === 'VOIDED',
        allocations: payment.allocations.map((allocation) => ({
          description: allocation.charge.description,
          amountCents: allocation.amountCents,
        })),
      },
    });

    return {
      buffer,
      fileName: `apodeixi-${payment.receiptNumber}.pdf`,
    };
  }

  async sweepOverdue(
    tenantId?: string,
  ): Promise<{ updated: number; notified: number; expiredScholarships: number }> {
    const charges = await this.prisma.charge.findMany({
      where: {
        ...(tenantId ? { tenantId } : {}),
        status: { in: ['PENDING', 'PARTIAL'] },
        dueDate: { lt: startOfTodayUtc() },
      },
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            userId: true,
            guardians: {
              select: { guardian: { select: { userId: true, email: true } } },
            },
          },
        },
      },
      take: 1000,
    });
    const expired = await this.prisma.scholarship.updateMany({
      where: {
        ...(tenantId ? { tenantId } : {}),
        status: 'APPROVED',
        validTo: { lt: startOfTodayUtc() },
      },
      data: { status: 'EXPIRED' },
    });
    if (!charges.length)
      return { updated: 0, notified: 0, expiredScholarships: expired.count };

    await this.prisma.charge.updateMany({
      where: { id: { in: charges.map((charge) => charge.id) } },
      data: { status: 'OVERDUE' },
    });

    const today = startOfTodayUtc().toISOString().slice(0, 10);
    let notified = 0;
    for (const charge of charges) {
      const dedupeKey = `overdue:${charge.id}:${today}`;
      const recipientIds = [
        charge.student.userId,
        ...charge.student.guardians.map((link) => link.guardian.userId),
      ].filter((value): value is string => Boolean(value));
      if (recipientIds.length) {
        const result = await this.prisma.notification.createMany({
          data: [...new Set(recipientIds)].map((userId) => ({
            tenantId: charge.tenantId,
            userId,
            type: 'PAYMENT_OVERDUE' as const,
            title: 'Ληξιπρόθεσμη οφειλή',
            body: `Η χρέωση «${charge.description}» ύψους ${euro(
              Math.max(0, charge.amountCents - charge.paidAmountCents),
            )} είναι ληξιπρόθεσμη.`,
            entityType: 'Charge',
            entityId: charge.id,
            dedupeKey,
          })),
          skipDuplicates: true,
        });
        notified += result.count;
      }

      const emails = [
        charge.student.email,
        ...charge.student.guardians.map((link) => link.guardian.email),
      ].filter((value): value is string => Boolean(value));
      for (const email of [...new Set(emails)]) {
        await this.outbox.enqueue({
          type: 'email',
          dedupeKey: `overdue-email:${charge.id}:${today}:${email}`,
          payload: {
            to: email,
            subject: 'Ληξιπρόθεσμη οφειλή',
            text: `Υπενθύμιση: η χρέωση «${charge.description}» του/της ${charge.student.firstName} ${charge.student.lastName} είναι ληξιπρόθεσμη.`,
          },
        });
      }
    }

    return {
      updated: charges.length,
      notified,
      expiredScholarships: expired.count,
    };
  }

  private async requireStudent(studentId: string) {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, tenantId: this.ctx.tenantId },
      select: { id: true },
    });
    if (!student) throw new NotFoundException('Ο μαθητής δεν βρέθηκε');
    return student;
  }

  private async recalculateCharge(tx: Prisma.TransactionClient, chargeId: string) {
    const [charge, totals] = await Promise.all([
      tx.charge.findUnique({ where: { id: chargeId } }),
      tx.paymentAllocation.aggregate({
        where: { chargeId, payment: { status: 'POSTED' } },
        _sum: { amountCents: true },
      }),
    ]);
    if (!charge) return;
    const paidAmountCents = totals._sum.amountCents ?? 0;
    const nextStatus = deriveStatus(
      charge.status,
      charge.amountCents,
      paidAmountCents,
      charge.dueDate,
    );
    await tx.charge.update({
      where: { id: chargeId },
      data: { paidAmountCents, status: nextStatus },
    });
    await this.refreshInstallmentPlan(tx, charge.installmentPlanId);
  }

  private async refreshInstallmentPlan(
    tx: Prisma.TransactionClient,
    installmentPlanId: string | null,
  ): Promise<void> {
    if (!installmentPlanId) return;
    const plan = await tx.installmentPlan.findUnique({
      where: { id: installmentPlanId },
      include: {
        charges: {
          select: { status: true, amountCents: true, paidAmountCents: true, dueDate: true },
        },
      },
    });
    if (!plan || plan.status !== 'ACTIVE') return;
    const complete = isInstallmentPlanComplete(
      plan.charges.map((charge) => ({
        status: deriveChargeStatus(
          charge.status,
          charge.amountCents,
          charge.paidAmountCents,
          charge.dueDate,
        ),
      })),
    );
    if (complete) {
      await tx.installmentPlan.update({
        where: { id: plan.id },
        data: { status: 'COMPLETED' },
      });
    }
  }
}
