import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { pageMeta } from '../../common/dto/pagination.dto.js';
import { ScopeService } from '../../common/scope.service.js';
import { TenantContextService } from '../../common/tenant-context.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import { DocumentsService } from '../documents/documents.service.js';
import type {
  PortalAttendanceQueryDto,
  PortalScheduleQueryDto,
} from './dto/portal.dto.js';

const TZ = 'Europe/Athens';

@Injectable()
export class PortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: TenantContextService,
    private readonly scope: ScopeService,
    private readonly documentsService: DocumentsService,
  ) {}

  async children() {
    if (!this.scope.isGuardian) {
      const student = await this.profile();
      return { data: [student] };
    }
    const childIds = await this.scope.guardianChildIds();
    const students = await this.prisma.student.findMany({
      where: { tenantId: this.ctx.tenantId, id: { in: childIds } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        registrationNumber: true,
        birthDate: true,
        branch: { select: { id: true, name: true, city: true } },
        enrollments: {
          where: { status: 'ACTIVE' },
          select: {
            id: true,
            program: { select: { id: true, name: true, color: true } },
            level: { select: { id: true, name: true } },
            teacher: { select: { id: true, firstName: true, lastName: true } },
          },
          orderBy: { enrolledAt: 'desc' },
          take: 3,
        },
      },
    });
    const byId = new Map(students.map((student) => [student.id, student]));
    return {
      data: childIds
        .map((id) => byId.get(id))
        .filter((student): student is NonNullable<typeof student> => Boolean(student)),
    };
  }

  async profile(studentId?: string) {
    const resolved = await this.resolveStudentId(studentId);
    const student = await this.prisma.student.findFirst({
      where: { id: resolved, tenantId: this.ctx.tenantId },
      include: {
        branch: { select: { id: true, name: true, city: true } },
        guardians: {
          include: { guardian: true },
          orderBy: { isPrimary: 'desc' },
        },
        enrollments: {
          include: {
            program: true,
            level: true,
            academicYear: { select: { id: true, name: true } },
            teacher: { select: { id: true, firstName: true, lastName: true } },
          },
          orderBy: { enrolledAt: 'desc' },
        },
      },
    });
    if (!student) throw new NotFoundException('Ο μαθητής δεν βρέθηκε');
    return student;
  }

  async schedule(query: PortalScheduleQueryDto) {
    const studentId = await this.resolveStudentId(query.studentId);
    const now = new Date();
    const today = formatInTimeZone(now, TZ, 'yyyy-MM-dd');
    const day = new Date(`${today}T00:00:00.000Z`).getUTCDay();
    const mondayOffset = (day + 6) % 7;
    const from = query.from ?? shiftDate(today, -mondayOffset);
    const to = query.to ?? shiftDate(from, 6);
    const rangeStart = fromZonedTime(`${from.slice(0, 10)}T00:00:00`, TZ);
    const rangeEnd = fromZonedTime(`${to.slice(0, 10)}T23:59:59.999`, TZ);

    const lessons = await this.prisma.lesson.findMany({
      where: {
        tenantId: this.ctx.tenantId,
        students: { some: { studentId } },
        startsAt: { gte: rangeStart, lte: rangeEnd },
        status: { not: 'CANCELLED' },
      },
      include: {
        teacher: { select: { id: true, firstName: true, lastName: true } },
        room: { select: { id: true, name: true } },
        branch: { select: { id: true, name: true } },
        lessonSeries: {
          select: {
            id: true,
            program: { select: { id: true, name: true, color: true } },
            level: { select: { id: true, name: true } },
          },
        },
        attendances: {
          where: { studentId },
          select: { status: true, minutesLate: true, notes: true },
        },
      },
      orderBy: { startsAt: 'asc' },
    });
    return { data: lessons, meta: { from, to, count: lessons.length } };
  }

  async attendance(query: PortalAttendanceQueryDto) {
    const studentId = await this.resolveStudentId(query.studentId);
    const where = {
      tenantId: this.ctx.tenantId,
      studentId,
      ...(query.from || query.to
        ? {
            lesson: {
              startsAt: {
                ...(query.from ? { gte: fromZonedTime(`${query.from.slice(0, 10)}T00:00:00`, TZ) } : {}),
                ...(query.to ? { lte: fromZonedTime(`${query.to.slice(0, 10)}T23:59:59.999`, TZ) } : {}),
              },
            },
          }
        : {}),
    };
    const [total, data, groups] = await Promise.all([
      this.prisma.attendance.count({ where }),
      this.prisma.attendance.findMany({
        where,
        include: {
          lesson: {
            select: {
              id: true,
              title: true,
              startsAt: true,
              endsAt: true,
              teacher: { select: { firstName: true, lastName: true } },
              lessonSeries: {
                select: { program: { select: { name: true, color: true } } },
              },
            },
          },
        },
        orderBy: { lesson: { startsAt: 'desc' } },
        skip: query.skip,
        take: query.pageSize,
      }),
      this.prisma.attendance.groupBy({
        by: ['status'],
        where: { tenantId: this.ctx.tenantId, studentId },
        _count: { _all: true },
      }),
    ]);
    const summary = { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0, total: 0 };
    for (const group of groups) {
      summary[group.status] = group._count._all;
      summary.total += group._count._all;
    }
    return {
      data,
      meta: {
        ...pageMeta(total, query.page, query.pageSize),
        summary: {
          ...summary,
          rate:
            summary.total === 0
              ? null
              : Math.round(((summary.PRESENT + summary.LATE) / summary.total) * 100),
        },
      },
    };
  }

  async results(studentId?: string) {
    const resolved = await this.resolveStudentId(studentId);
    return this.prisma.examResult.findMany({
      where: {
        tenantId: this.ctx.tenantId,
        studentId: resolved,
        exam: { status: 'PUBLISHED' },
      },
      include: {
        exam: {
          include: {
            program: { select: { id: true, name: true, color: true } },
            level: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { exam: { examDate: 'desc' } },
    });
  }

  async finance(studentId?: string) {
    const resolved = await this.resolveStudentId(studentId);
    const [charges, payments] = await Promise.all([
      this.prisma.charge.findMany({
        where: { tenantId: this.ctx.tenantId, studentId: resolved },
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
        where: { tenantId: this.ctx.tenantId, studentId: resolved },
        include: {
          allocations: {
            select: {
              amountCents: true,
              charge: { select: { description: true, period: true } },
            },
          },
        },
        orderBy: { paidAt: 'desc' },
      }),
    ]);

    let billedCents = 0;
    let outstandingCents = 0;
    const entries = charges.map((charge) => {
      const balanceCents = Math.max(0, charge.amountCents - charge.paidAmountCents);
      if (charge.status !== 'CANCELLED') {
        billedCents += charge.amountCents;
        outstandingCents += balanceCents;
      }
      return {
        ...charge,
        balanceCents,
        amount: charge.amountCents / 100,
        paidAmount: charge.paidAmountCents / 100,
        balance: balanceCents / 100,
      };
    });
    const collectedCents = payments
      .filter((payment) => payment.status === 'POSTED')
      .reduce((sum, payment) => sum + payment.amountCents, 0);

    return {
      summary: {
        billedCents,
        collectedCents,
        outstandingCents,
        billed: billedCents / 100,
        collected: collectedCents / 100,
        outstanding: outstandingCents / 100,
      },
      charges: entries,
      payments: payments.map((payment) => ({
        ...payment,
        amount: payment.amountCents / 100,
        charge:
          payment.allocations?.[0]?.charge ??
          null,
      })),
    };
  }

  async overview(studentId?: string) {
    const resolved = await this.resolveStudentId(studentId);
    const now = new Date();
    const [student, nextLesson, attendanceGroups, charges, results] = await Promise.all([
      this.prisma.student.findFirst({
        where: { id: resolved, tenantId: this.ctx.tenantId },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          registrationNumber: true,
          branch: { select: { id: true, name: true, city: true } },
          enrollments: {
            where: { status: 'ACTIVE' },
            select: {
              id: true,
              program: { select: { id: true, name: true, color: true } },
              level: { select: { id: true, name: true } },
              teacher: { select: { id: true, firstName: true, lastName: true } },
            },
            orderBy: { enrolledAt: 'desc' },
            take: 3,
          },
        },
      }),
      this.prisma.lesson.findFirst({
        where: {
          tenantId: this.ctx.tenantId,
          students: { some: { studentId: resolved } },
          startsAt: { gte: now },
          status: 'SCHEDULED',
        },
        include: {
          teacher: { select: { id: true, firstName: true, lastName: true } },
          room: { select: { id: true, name: true } },
          branch: { select: { id: true, name: true } },
          lessonSeries: {
            select: {
              id: true,
              program: { select: { id: true, name: true, color: true } },
              level: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { startsAt: 'asc' },
      }),
      this.prisma.attendance.groupBy({
        by: ['status'],
        where: { tenantId: this.ctx.tenantId, studentId: resolved },
        _count: { _all: true },
      }),
      this.prisma.charge.findMany({
        where: {
          tenantId: this.ctx.tenantId,
          studentId: resolved,
          status: { notIn: ['CANCELLED', 'PAID'] },
        },
        select: { amountCents: true, paidAmountCents: true },
      }),
      this.prisma.examResult.findMany({
        where: {
          tenantId: this.ctx.tenantId,
          studentId: resolved,
          exam: { status: 'PUBLISHED' },
        },
        include: {
          exam: {
            include: {
              program: { select: { id: true, name: true, color: true } },
              level: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { exam: { examDate: 'desc' } },
        take: 3,
      }),
    ]);
    if (!student) throw new NotFoundException('Ο μαθητής δεν βρέθηκε');
    let total = 0;
    let good = 0;
    for (const group of attendanceGroups) {
      total += group._count._all;
      if (group.status === 'PRESENT' || group.status === 'LATE') {
        good += group._count._all;
      }
    }
    const outstandingCents = charges.reduce(
      (sum, charge) => sum + Math.max(0, charge.amountCents - charge.paidAmountCents),
      0,
    );
    return {
      student,
      nextLesson,
      attendance: {
        total,
        rate: total === 0 ? null : Math.round((good / total) * 100),
      },
      finance: {
        outstandingCents,
        outstanding: Math.round((outstandingCents / 100) * 100) / 100,
      },
      latestResults: results,
    };
  }

  async documents(studentId?: string) {
    const resolved = await this.resolveStudentId(studentId);
    return this.prisma.documentRecord.findMany({
      where: {
        tenantId: this.ctx.tenantId,
        studentId: resolved,
        status: { not: 'DRAFT' },
      },
      orderBy: [{ issuedAt: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async documentPdf(documentId: string, studentId?: string) {
    const resolved = await this.resolveStudentId(studentId);
    return this.documentsService.pdfForStudent(documentId, resolved);
  }

  private async resolveStudentId(studentId?: string): Promise<string> {
    if (studentId) {
      await this.scope.assertStudentAccessible(studentId);
      return studentId;
    }
    if (this.scope.isGuardian) {
      const childIds = await this.scope.guardianChildIds();
      if (childIds.length === 1) return childIds[0];
      if (!childIds.length) {
        throw new NotFoundException('Δεν υπάρχουν συνδεδεμένα παιδιά');
      }
      throw new BadRequestException({
        code: 'PORTAL_STUDENT_REQUIRED',
        message: 'Επιλέξτε παιδί για να δείτε τα στοιχεία',
      });
    }
    return this.scope.requireStudentId();
  }
}

function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
