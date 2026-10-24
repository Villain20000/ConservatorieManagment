import { Injectable } from '@nestjs/common';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { ScopeService } from '../../common/scope.service.js';
import { TenantContextService } from '../../common/tenant-context.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import { FinanceService } from '../finance/finance.service.js';

const TZ = 'Europe/Athens';

function isoDate(date: Date): string {
  return formatInTimeZone(date, TZ, 'yyyy-MM-dd');
}

function athensWeekRange(date: Date): { start: Date; end: Date } {
  const weekday = Number(formatInTimeZone(date, TZ, 'i'));
  const noon = fromZonedTime(`${isoDate(date)}T12:00:00`, TZ);
  const monday = new Date(noon.getTime() - (weekday - 1) * 86_400_000);
  const sunday = new Date(monday.getTime() + 6 * 86_400_000);
  return { start: startOfAthensDay(monday), end: endOfAthensDay(sunday) };
}

function startOfAthensDay(date: Date): Date {
  return fromZonedTime(`${isoDate(date)}T00:00:00`, TZ);
}

function endOfAthensDay(date: Date): Date {
  return fromZonedTime(`${isoDate(date)}T23:59:59.999`, TZ);
}

function addMonths(date: Date, months: number): Date {
  const value = new Date(date);
  value.setUTCMonth(value.getUTCMonth() + months);
  return value;
}

function athensMonth(date: Date): string {
  return formatInTimeZone(date, TZ, 'yyyy-MM');
}

function shiftMonth(month: string, delta: number): string {
  const [year, value] = month.split('-').map(Number);
  return new Date(Date.UTC(year, value - 1 + delta, 1)).toISOString().slice(0, 7);
}

const todayLessonInclude = {
  teacher: { select: { id: true, firstName: true, lastName: true } },
  room: { select: { id: true, name: true } },
  branch: { select: { id: true, name: true } },
  lessonSeries: {
    select: { program: { select: { id: true, name: true, color: true } } },
  },
  _count: { select: { students: true, notes: true } },
} as const;

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: TenantContextService,
    private readonly scope: ScopeService,
    private readonly finance: FinanceService,
  ) {}

  async getDashboard(role: string) {
    switch (role) {
      case 'DIRECTOR':
        return this.directorDashboard();
      case 'ADMINISTRATOR':
        return this.administratorDashboard();
      case 'TEACHER':
        return this.teacherDashboard();
      case 'STUDENT':
        return this.studentDashboard();
      case 'GUARDIAN':
        return this.guardianDashboard();
      default:
        return { role, generatedAt: new Date() };
    }
  }

  private async directorDashboard() {
    const tenantId = this.ctx.tenantId;
    const now = new Date();
    const currentMonth = athensMonth(now);
    const monthStart = fromZonedTime(`${currentMonth}-01T00:00:00`, TZ);
    const trendMonths = Array.from({ length: 6 }, (_, index) =>
      shiftMonth(currentMonth, index - 5),
    );
    const sixMonthsAgo = fromZonedTime(`${trendMonths[0]}-01T00:00:00`, TZ);

    const [
      activeStudents,
      activeTeachers,
      todayLessons,
      attendanceGroups,
      newStudents,
      branches,
      announcements,
      finance,
      atRisk,
      overdueCount,
    ] = await Promise.all([
      this.prisma.student.count({ where: { tenantId, status: 'ACTIVE' } }),
      this.prisma.teacher.count({ where: { tenantId, status: 'ACTIVE' } }),
      this.todayLessons(tenantId),
      this.prisma.attendance.groupBy({
        by: ['status'],
        where: { tenantId, lesson: { startsAt: { gte: monthStart } } },
        _count: { _all: true },
      }),
      this.prisma.student.findMany({
        where: { tenantId, enrolledAt: { gte: sixMonthsAgo } },
        select: { enrolledAt: true },
      }),
      this.prisma.branch.findMany({
        where: { tenantId },
        include: {
          _count: {
            select: {
              students: true,
              lessonSeries: true,
              rooms: true,
            },
          },
        },
        orderBy: { name: 'asc' },
      }),
      this.announcementsForRole(3),
      this.finance.overview(),
      this.attendanceRisk(tenantId, null),
      this.prisma.charge.count({ where: { tenantId, status: 'OVERDUE' } }),
    ]);

    return {
      role: 'DIRECTOR',
      generatedAt: now,
      stats: {
        activeStudents,
        activeTeachers,
        attendanceRate: this.rate(attendanceGroups),
        attendanceMarked: attendanceGroups.reduce(
          (sum, group) => sum + group._count._all,
          0,
        ),
        collected: finance.totals.collectedCents / 100,
        outstanding: finance.totals.outstandingCents / 100,
        overdue: finance.totals.overdueCents / 100,
        overdueCount,
        collectionRate: finance.totals.collectionRate,
      },
      enrollmentTrend: trendMonths.map((month) => ({
        month,
        count: newStudents.filter(
          (student) => athensMonth(student.enrolledAt) === month,
        ).length,
      })),
      todayLessons,
      branchBreakdown: branches.map((branch) => ({
        id: branch.id,
        name: branch.name,
        code: branch.code,
        students: branch._count.students,
        series: branch._count.lessonSeries,
        rooms: branch._count.rooms,
      })),
      finance: {
        monthly: finance.monthly.slice(-6),
        topDebtors: finance.topDebtors,
        recentPayments: finance.recentPayments.slice(0, 4),
      },
      atRiskStudents: atRisk.slice(0, 5),
      recentAnnouncements: announcements,
    };
  }

  private async administratorDashboard() {
    const tenantId = this.ctx.tenantId;
    const now = new Date();
    const monthStart = fromZonedTime(`${athensMonth(now)}-01T00:00:00`, TZ);
    const [todayLessons, unmarkedPast, newStudents, overdueCharges, finance, announcements] =
      await Promise.all([
        this.todayLessons(tenantId),
        this.prisma.lesson.count({
          where: {
            tenantId,
            status: 'SCHEDULED',
            endsAt: { lt: now },
            startsAt: { gte: addMonths(now, -1) },
          },
        }),
        this.prisma.student.count({
          where: { tenantId, enrolledAt: { gte: monthStart } },
        }),
        this.prisma.charge.count({ where: { tenantId, status: 'OVERDUE' } }),
        this.finance.overview(),
        this.announcementsForRole(3),
      ]);

    return {
      role: 'ADMINISTRATOR',
      generatedAt: now,
      stats: {
        lessonsToday: todayLessons.length,
        unmarkedPast,
        newStudentsThisMonth: newStudents,
        overdueCharges,
        outstanding: finance.totals.outstandingCents / 100,
        studentsWithBalance: finance.totals.studentsWithBalance,
      },
      todayLessons,
      recentPayments: finance.recentPayments.slice(0, 5),
      topDebtors: finance.topDebtors,
      recentAnnouncements: announcements,
    };
  }

  private async teacherDashboard() {
    const tenantId = this.ctx.tenantId;
    const teacherId = await this.scope.teacherIdOrNull();
    if (!teacherId) {
      return {
        role: 'TEACHER',
        generatedAt: new Date(),
        teacher: null,
        stats: {
          lessonsToday: 0,
          lessonsThisWeek: 0,
          hoursThisWeek: 0,
          assignedStudents: 0,
          unmarkedPast: 0,
          attendanceRate: null,
        },
        todayLessons: [],
        weekLessons: [],
        attendanceHighlights: [],
        recentAnnouncements: await this.announcementsForRole(3),
      };
    }

    const now = new Date();
    const teacher = await this.prisma.teacher.findFirst({
      where: { id: teacherId, tenantId },
      select: { id: true, firstName: true, lastName: true, title: true, specialties: true },
    });
    const { start: weekStart, end: weekEnd } = athensWeekRange(now);

    const [todayLessons, weekLessons, unmarked, enrollments, seriesStudents, attendance] =
      await Promise.all([
        this.todayLessons(tenantId, teacherId),
        this.prisma.lesson.findMany({
          where: {
            tenantId,
            teacherId,
            startsAt: { gte: weekStart, lte: weekEnd },
            status: { not: 'CANCELLED' },
          },
          include: todayLessonInclude,
          orderBy: { startsAt: 'asc' },
        }),
        this.prisma.lesson.count({
          where: {
            tenantId,
            teacherId,
            status: 'SCHEDULED',
            endsAt: { lt: now },
            startsAt: { gte: addMonths(now, -1) },
          },
        }),
        this.prisma.enrollment.findMany({
          where: { tenantId, teacherId, status: 'ACTIVE' },
          select: { studentId: true },
          distinct: ['studentId'],
        }),
        this.prisma.lessonSeriesStudent.findMany({
          where: { tenantId, lessonSeries: { teacherId } },
          select: { studentId: true },
          distinct: ['studentId'],
        }),
        this.prisma.attendance.groupBy({
          by: ['status'],
          where: { tenantId, lesson: { teacherId, startsAt: { gte: addMonths(now, -1) } } },
          _count: { _all: true },
        }),
      ]);

    const assigned = new Set([
      ...enrollments.map((row) => row.studentId),
      ...seriesStudents.map((row) => row.studentId),
    ]);
    const hours = weekLessons.reduce(
      (sum, lesson) => sum + (lesson.endsAt.getTime() - lesson.startsAt.getTime()) / 3_600_000,
      0,
    );

    return {
      role: 'TEACHER',
      generatedAt: now,
      teacher,
      stats: {
        lessonsToday: todayLessons.length,
        lessonsThisWeek: weekLessons.length,
        hoursThisWeek: Math.round(hours * 10) / 10,
        assignedStudents: assigned.size,
        unmarkedPast: unmarked,
        attendanceRate: this.rate(attendance),
      },
      todayLessons,
      weekLessons: weekLessons.slice(0, 8),
      attendanceHighlights: await this.teacherHighlights(tenantId, teacherId, [...assigned]),
      recentAnnouncements: await this.announcementsForRole(3),
    };
  }

  private async studentDashboard() {
    const studentId = await this.scope.studentIdOrNull();
    if (!studentId) {
      return {
        role: 'STUDENT',
        generatedAt: new Date(),
        student: null,
        stats: { attendanceRate: null, attendanceTotal: 0, outstanding: 0, unread: 0 },
        nextLesson: null,
        weekLessons: [],
        recentAttendance: [],
        latestResults: [],
        recentAnnouncements: await this.announcementsForRole(3),
      };
    }
    return this.studentDashboardFor(studentId);
  }

  private async guardianDashboard() {
    const now = new Date();
    const childIds = await this.scope.guardianChildIds();
    const children = await Promise.all(
      childIds.map((studentId) => this.studentDashboardFor(studentId)),
    );
    return {
      role: 'GUARDIAN',
      generatedAt: now,
      children: children.filter((entry) => entry.student !== null),
    };
  }

  private async studentDashboardFor(studentId: string) {
    const tenantId = this.ctx.tenantId;

    const now = new Date();
    const { start: weekStart, end: weekEnd } = athensWeekRange(now);

    const [student, weekLessons, nextLesson, attendanceGroups, recentAttendance, results, charges, unread, announcements] =
      await Promise.all([
        this.prisma.student.findFirst({
          where: { id: studentId, tenantId },
          include: {
            branch: { select: { id: true, name: true } },
            enrollments: {
              where: { status: 'ACTIVE' },
              include: {
                program: { select: { id: true, name: true, color: true } },
                level: { select: { id: true, name: true } },
                teacher: { select: { id: true, firstName: true, lastName: true } },
                academicYear: { select: { id: true, name: true } },
              },
              take: 1,
            },
          },
        }),
        this.prisma.lesson.findMany({
          where: {
            tenantId,
            students: { some: { studentId } },
            startsAt: { gte: weekStart, lte: weekEnd },
            status: { not: 'CANCELLED' },
          },
          include: {
            teacher: { select: { firstName: true, lastName: true } },
            room: { select: { name: true } },
            branch: { select: { name: true } },
            lessonSeries: {
              select: { program: { select: { name: true, color: true } } },
            },
          },
          orderBy: { startsAt: 'asc' },
        }),
        this.prisma.lesson.findFirst({
          where: {
            tenantId,
            students: { some: { studentId } },
            startsAt: { gte: now },
            status: 'SCHEDULED',
          },
          include: {
            teacher: { select: { firstName: true, lastName: true } },
            room: { select: { name: true } },
            branch: { select: { name: true } },
            lessonSeries: {
              select: { program: { select: { name: true, color: true } } },
            },
          },
          orderBy: { startsAt: 'asc' },
        }),
        this.prisma.attendance.groupBy({
          by: ['status'],
          where: { tenantId, studentId },
          _count: { _all: true },
        }),
        this.prisma.attendance.findMany({
          where: { tenantId, studentId },
          include: {
            lesson: {
              select: { id: true, title: true, startsAt: true },
            },
          },
          orderBy: { lesson: { startsAt: 'desc' } },
          take: 5,
        }),
        this.prisma.examResult.findMany({
          where: { tenantId, studentId },
          include: {
            exam: {
              include: {
                program: { select: { name: true, color: true } },
                level: { select: { name: true } },
              },
            },
          },
          orderBy: { exam: { examDate: 'desc' } },
          take: 4,
        }),
        this.prisma.charge.findMany({
          where: { tenantId, studentId, status: { notIn: ['CANCELLED', 'PAID'] } },
          select: { amountCents: true, paidAmountCents: true },
        }),
        this.prisma.notification.count({
          where: { tenantId, userId: this.ctx.userId, readAt: null },
        }),
        this.announcementsForRole(3),
      ]);

    const outstandingCents = charges.reduce(
      (sum, charge) => sum + Math.max(0, charge.amountCents - charge.paidAmountCents),
      0,
    );
    const outstanding = outstandingCents / 100;

    return {
      role: 'STUDENT',
      generatedAt: now,
      student,
      stats: {
        attendanceRate: this.rate(attendanceGroups),
        attendanceTotal: attendanceGroups.reduce(
          (sum, group) => sum + group._count._all,
          0,
        ),
        outstanding: Math.round(outstanding * 100) / 100,
        unread,
      },
      nextLesson,
      weekLessons,
      recentAttendance,
      latestResults: results,
      recentAnnouncements: announcements,
    };
  }

  private async todayLessons(tenantId: string, teacherId?: string) {
    const now = new Date();
    return this.prisma.lesson.findMany({
      where: {
        tenantId,
        startsAt: { gte: startOfAthensDay(now), lte: endOfAthensDay(now) },
        ...(teacherId ? { teacherId } : {}),
        status: { not: 'CANCELLED' },
      },
      include: todayLessonInclude,
      orderBy: { startsAt: 'asc' },
    });
  }

  private async announcementsForRole(take: number) {
    const where: Prisma.AnnouncementWhereInput = { tenantId: this.ctx.tenantId };
    if (!this.scope.isAdministrator && this.ctx.role) {
      where.OR = [
        { audienceRoles: { isEmpty: true } },
        { audienceRoles: { has: this.ctx.role } },
      ];
    }
    return this.prisma.announcement.findMany({
      where,
      include: { author: { select: { firstName: true, lastName: true } } },
      orderBy: [{ isPinned: 'desc' }, { publishedAt: 'desc' }],
      take,
    });
  }

  private async attendanceRisk(tenantId: string, teacherId: string | null) {
    const since = addMonths(new Date(), -1);
    const groups = await this.prisma.attendance.groupBy({
      by: ['studentId', 'status'],
      where: {
        tenantId,
        lesson: {
          startsAt: { gte: since },
          ...(teacherId ? { teacherId } : {}),
        },
      },
      _count: { _all: true },
    });
    const totals = new Map<string, { total: number; good: number }>();
    for (const group of groups) {
      const entry = totals.get(group.studentId) ?? { total: 0, good: 0 };
      entry.total += group._count._all;
      if (group.status === 'PRESENT' || group.status === 'LATE') {
        entry.good += group._count._all;
      }
      totals.set(group.studentId, entry);
    }
    const risky = [...totals.entries()]
      .filter(([, value]) => value.total >= 4 && value.good / value.total < 0.8)
      .map(([studentId, value]) => ({
        studentId,
        rate: Math.round((value.good / value.total) * 100),
        absences: value.total - value.good,
        total: value.total,
      }))
      .sort((a, b) => a.rate - b.rate)
      .slice(0, 8);
    if (!risky.length) return [];
    const students = await this.prisma.student.findMany({
      where: { tenantId, id: { in: risky.map((entry) => entry.studentId) } },
      select: { id: true, firstName: true, lastName: true, registrationNumber: true },
    });
    const byId = new Map(students.map((student) => [student.id, student]));
    return risky.flatMap((entry) => {
      const student = byId.get(entry.studentId);
      return student
        ? [{ ...student, rate: entry.rate, absences: entry.absences, total: entry.total }]
        : [];
    });
  }

  private async teacherHighlights(tenantId: string, teacherId: string, studentIds: string[]) {
    if (!studentIds.length) return [];
    const since = addMonths(new Date(), -1);
    const groups = await this.prisma.attendance.groupBy({
      by: ['studentId', 'status'],
      where: {
        tenantId,
        studentId: { in: studentIds },
        lesson: { teacherId, startsAt: { gte: since } },
      },
      _count: { _all: true },
    });
    const totals = new Map<string, { total: number; good: number }>();
    for (const group of groups) {
      const entry = totals.get(group.studentId) ?? { total: 0, good: 0 };
      entry.total += group._count._all;
      if (group.status === 'PRESENT' || group.status === 'LATE') {
        entry.good += group._count._all;
      }
      totals.set(group.studentId, entry);
    }
    const entries = [...totals.entries()]
      .map(([studentId, value]) => ({
        studentId,
        rate: Math.round((value.good / value.total) * 100),
        absences: value.total - value.good,
      }))
      .sort((a, b) => a.rate - b.rate)
      .slice(0, 5);
    const students = await this.prisma.student.findMany({
      where: { tenantId, id: { in: entries.map((entry) => entry.studentId) } },
      select: { id: true, firstName: true, lastName: true, registrationNumber: true },
    });
    const byId = new Map(students.map((student) => [student.id, student]));
    return entries.flatMap((entry) => {
      const student = byId.get(entry.studentId);
      return student
        ? [{ ...student, rate: entry.rate, absences: entry.absences }]
        : [];
    });
  }

  private rate(groups: { status: string; _count: { _all: number } }[]): number | null {
    let total = 0;
    let good = 0;
    for (const group of groups) {
      total += group._count._all;
      if (group.status === 'PRESENT' || group.status === 'LATE') {
        good += group._count._all;
      }
    }
    return total === 0 ? null : Math.round((good / total) * 100);
  }

}
