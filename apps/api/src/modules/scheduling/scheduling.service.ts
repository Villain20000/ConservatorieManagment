import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { AuditService } from '../../common/audit.service.js';
import { NotificationsService } from '../../common/notifications.service.js';
import { ScopeService } from '../../common/scope.service.js';
import { TenantContextService } from '../../common/tenant-context.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import type {
  CalendarDayInputDto,
  CalendarDayQueryDto,
  CancelLessonDto,
  ConflictCheckDto,
  CreateLessonSeriesDto,
  LessonQueryDto,
  RescheduleLessonDto,
  SeriesQueryDto,
  UpdateLessonSeriesDto,
} from './dto/scheduling.dto.js';
import { addDays, buildOccurrences as buildRecurrence, groupRules, type CalendarDayRule } from './recurrence.js';
import { getGreekStatutoryHolidays } from './greek-calendar.js';

const TZ = 'Europe/Athens';
const MAX_LESSONS_PER_SERIES = 500;
const MAX_RANGE_DAYS = 400;
const MAX_QUERY_DAYS = 120;

interface Occurrence {
  startsAt: Date;
  endsAt: Date;
  date?: string;
}

interface Conflict {
  startsAt: Date;
  reason: string;
}

interface ConflictOptions {
  teacherId: string;
  roomId?: string | null;
  studentIds?: string[];
  excludeLessonId?: string;
  excludeSeriesId?: string;
}

function isoDate(value: Date | string): string {
  if (typeof value === 'string') return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Guards path identifiers before they reach the driver (which would 500). */
function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

function athensDateTime(date: string, time: string): Date {
  return fromZonedTime(`${date}T${time}:00`, TZ);
}

function isoWeekday(date: string): number {
  const day = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  return ((day + 6) % 7) + 1;
}

function daysBetween(from: string, to: string): number {
  return Math.round(
    (new Date(`${to}T00:00:00.000Z`).getTime() -
      new Date(`${from}T00:00:00.000Z`).getTime()) /
      86_400_000,
  );
}

function endOfDay(date: string): Date {
  return fromZonedTime(`${date}T23:59:59.999`, TZ);
}

function startOfDay(date: string): Date {
  return fromZonedTime(`${date}T00:00:00.000`, TZ);
}

function formatSlot(date: Date): string {
  return formatInTimeZone(date, TZ, 'dd/MM/yyyy HH:mm');
}

const lessonInclude = {
  branch: { select: { id: true, name: true, code: true } },
  room: { select: { id: true, name: true } },
  teacher: { select: { id: true, firstName: true, lastName: true } },
  lessonSeries: {
    select: {
      id: true,
      title: true,
      type: true,
      program: { select: { id: true, name: true, code: true, color: true } },
      level: { select: { id: true, name: true } },
    },
  },
  students: {
    include: {
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          registrationNumber: true,
        },
      },
    },
  },
  attendances: {
    select: { studentId: true, status: true, minutesLate: true },
  },
  _count: { select: { notes: true } },
} as const;

@Injectable()
export class SchedulingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: TenantContextService,
    private readonly scope: ScopeService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  async options() {
    const tenantId = this.ctx.tenantId;
    const [branches, rooms, teachers, programs, levels, years] = await Promise.all([
      this.prisma.branch.findMany({
        where: { tenantId, isActive: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.room.findMany({
        where: { tenantId, isActive: true },
        include: { branch: { select: { id: true, name: true } } },
        orderBy: { name: 'asc' },
      }),
      this.prisma.teacher.findMany({
        where: { tenantId, status: 'ACTIVE' },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        select: { id: true, firstName: true, lastName: true, specialties: true },
      }),
      this.prisma.program.findMany({
        where: { tenantId, isActive: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.level.findMany({
        where: { tenantId, isActive: true },
        orderBy: { sortOrder: 'asc' },
      }),
      this.prisma.academicYear.findMany({
        where: { tenantId },
        orderBy: { startsOn: 'desc' },
      }),
    ]);
    return {
      branches,
      rooms,
      teachers,
      programs,
      levels,
      years,
      activeYear: years.find((year) => year.isActive) ?? years[0] ?? null,
    };
  }

  // ───────────────────────── Calendar (holidays & make-up days) ─────────────────────────

  /** Tenant and branch calendar rules inside a range, ordered by date. */
  async listCalendarDays(query: CalendarDayQueryDto) {
    const tenantId = this.ctx.tenantId;
    const today = isoDate(new Date());
    const from = query.from ?? `${today.slice(0, 4)}-01-01`;
    const to = query.to ?? `${Number(today.slice(0, 4)) + 1}-12-31`;
    if (to < from) {
      throw new BadRequestException('Η ημερομηνία λήξης πρέπει να είναι μετά την έναρξη');
    }
    const rows = await this.prisma.calendarDay.findMany({
      where: {
        tenantId,
        date: { gte: new Date(`${from}T00:00:00.000Z`), lte: new Date(`${to}T00:00:00.000Z`) },
        ...(query.branchId
          ? { OR: [{ branchId: null }, { branchId: query.branchId }] }
          : {}),
      },
      include: {
        branch: {
          select: { id: true, name: true },
        },
      },
      orderBy: [{ date: 'asc' }, { kind: 'asc' }],
   });
    return {
      data: rows.map((row) => ({ ...row, date: isoDate(row.date) })),
    };
  }

  /**
   * Adds a holiday, closure or make-up day. Branch-scoped rules must name a
   * branch of this tenant; duplicates are rejected by the database constraint
   * and surfaced as a 409 rather than a 500.
   */
  async createCalendarDay(dto: CalendarDayInputDto) {
    const tenantId = this.ctx.tenantId;
    if (dto.branchId) {
      const branch = await this.prisma.branch.findFirst({
        where: { id: dto.branchId, tenantId },
        select: { id: true },
     });
      if (!branch) throw new NotFoundException('Το παράρτημα δεν βρέθηκε');
    }
    try {
      const created = await this.prisma.calendarDay.create({
        data: {
          tenantId,
          branchId: dto.branchId ?? null,
          date: new Date(`${dto.date}T00:00:00.000Z`),
          kind: dto.kind,
          name: dto.name.trim(),
        },
     });
      await this.audit.record('calendarDay.created', 'CalendarDay', created.id, {
        date: dto.date,
        kind: dto.kind,
        branchId: dto.branchId ?? null,
     });
      return { ...created, date: isoDate(created.date) };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException({
          code: 'CALENDAR_DAY_EXISTS',
          message: 'Υπάρχει ήδη καταχώριση για αυτή την ημέρα',
       });
      }
      throw error;
    }
  }

  async removeCalendarDay(id: string) {
    // A malformed path id is a client error, not a 500 from the driver.
    if (!isUuid(id)) throw new NotFoundException('Η καταχώριση δεν βρέθηκε');
    const existing = await this.prisma.calendarDay.findFirst({
      where: { id, tenantId: this.ctx.tenantId },
      select: { id: true, date: true, kind: true, name: true },
         });
    if (!existing) throw new NotFoundException('Η καταχώριση δεν βρέθηκε');
    await this.prisma.calendarDay.deleteMany({
      where: { id, tenantId: this.ctx.tenantId },
         });
    await this.audit.record('calendarDay.deleted', 'CalendarDay', id, {
      date: isoDate(existing.date),
      kind: existing.kind,
         });
    return { success: true };
  }

  async seedGreekHolidays(year?: number) {
    const tenantId = this.ctx.tenantId;
    const targetYear = year ?? new Date().getFullYear();
    const holidays = getGreekStatutoryHolidays(targetYear);
    let createdCount = 0;

    for (const holiday of holidays) {
      const dateObj = new Date(`${holiday.date}T00:00:00.000Z`);
      const existing = await this.prisma.calendarDay.findFirst({
        where: { tenantId, branchId: null, date: dateObj },
      });
      if (!existing) {
        await this.prisma.calendarDay.create({
          data: {
            tenantId,
            branchId: null,
            date: dateObj,
            kind: holiday.kind,
            name: holiday.name,
          },
        });
        createdCount++;
      }
    }

    await this.audit.record('calendarDay.seeded', 'CalendarDay', null, {
      year: targetYear,
      createdCount,
    });

    return { year: targetYear, createdCount, totalHolidays: holidays.length };
  }

  async listSeries(query: SeriesQueryDto) {
    const where: Prisma.LessonSeriesWhereInput = { tenantId: this.ctx.tenantId };
    if (query.branchId) where.branchId = query.branchId;
    if (query.teacherId) where.teacherId = query.teacherId;
    if (query.roomId) where.roomId = query.roomId;
    if (query.programId) where.programId = query.programId;
    if (query.status) where.status = query.status;

    if (this.scope.isTeacher) {
      where.teacherId = await this.scope.requireTeacherId();
    } else if (this.scope.isStudent) {
      const studentId = await this.scope.requireStudentId();
      where.students = { some: { studentId } };
    }

    return this.prisma.lessonSeries.findMany({
      where,
      include: {
        branch: { select: { id: true, name: true } },
        room: { select: { id: true, name: true } },
        teacher: { select: { id: true, firstName: true, lastName: true } },
        program: { select: { id: true, name: true, code: true, color: true } },
        level: { select: { id: true, name: true } },
        students: {
          include: {
            student: {
              select: { id: true, firstName: true, lastName: true, registrationNumber: true },
            },
          },
        },
      },
      orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }],
         });
  }

  async createSeries(dto: CreateLessonSeriesDto) {
    const tenantId = this.ctx.tenantId;
    const studentIds = [...new Set(dto.studentIds ?? [])];
    await this.assertSeriesRefs(dto, studentIds);

    const range = await this.resolveRange(dto.validFrom, dto.validTo);
    const occurrences = await this.buildOccurrences(
      {
        validFrom: range.validFrom,
        validTo: range.validTo,
        weekday: dto.weekday,
        startTime: dto.startTime,
        durationMinutes: dto.durationMinutes,
      },
      range.validFrom,
      dto.branchId,
    );
    if (!occurrences.length) {
      throw new BadRequestException('Το πρόγραμμα δεν παράγει μαθήματα στο διάστημα ισχύος');
    }

    const conflicts = await this.findConflicts(occurrences, {
      teacherId: dto.teacherId,
      roomId: dto.roomId,
      studentIds,
         });
    if (conflicts.length) this.throwConflicts(conflicts);

    const series = await this.prisma.$transaction(async (tx) => {
      const created = await tx.lessonSeries.create({
        data: {
          tenantId,
          branchId: dto.branchId,
          roomId: dto.roomId,
          teacherId: dto.teacherId,
          programId: dto.programId,
          levelId: dto.levelId,
          type: dto.type,
          title: dto.title,
          weekday: dto.weekday,
          startTime: dto.startTime,
          durationMinutes: dto.durationMinutes,
          validFrom: new Date(`${range.validFrom}T00:00:00.000Z`),
          validTo: new Date(`${range.validTo}T00:00:00.000Z`),
          status: dto.status ?? 'ACTIVE',
        },
     });

      if (studentIds.length) {
        await tx.lessonSeriesStudent.createMany({
          data: studentIds.map((studentId) => ({
            tenantId,
            lessonSeriesId: created.id,
            studentId,
          })),
          skipDuplicates: true,
       });
      }

      if (created.status === 'ACTIVE') {
        await this.materialize(tx, created, occurrences, studentIds);
      }
      return created;
         });

    await this.audit.record('lessonSeries.created', 'LessonSeries', series.id, {
      lessons: occurrences.length,
         });
    return this.getSeries(series.id);
  }

  async updateSeries(id: string, dto: UpdateLessonSeriesDto) {
    const existing = await this.prisma.lessonSeries.findFirst({
      where: { id, tenantId: this.ctx.tenantId },
      include: { students: { select: { studentId: true } } },
         });
    if (!existing) throw new NotFoundException('Το πρόγραμμα δεν βρέθηκε');

    const merged = {
      branchId: dto.branchId ?? existing.branchId,
      roomId: dto.roomId ?? existing.roomId,
      teacherId: dto.teacherId ?? existing.teacherId,
      programId: dto.programId ?? existing.programId,
      levelId: dto.levelId === undefined ? existing.levelId : dto.levelId,
      type: dto.type ?? existing.type,
      title: dto.title ?? existing.title,
      weekday: dto.weekday ?? existing.weekday,
      startTime: dto.startTime ?? existing.startTime,
      durationMinutes: dto.durationMinutes ?? existing.durationMinutes,
      validFrom: dto.validFrom ? isoDate(dto.validFrom) : isoDate(existing.validFrom),
      validTo:
        dto.validTo === undefined
          ? existing.validTo
            ? isoDate(existing.validTo)
            : null
          : dto.validTo
            ? isoDate(dto.validTo)
            : null,
      status: dto.status ?? existing.status,
    };
    const studentIds =
      dto.studentIds !== undefined
        ? [...new Set(dto.studentIds)]
        : existing.students.map((row) => row.studentId);

    await this.assertSeriesRefs(merged, studentIds);
    const range = await this.resolveRange(merged.validFrom, merged.validTo ?? undefined);
    const today = isoDate(new Date());

    const occurrences =
      merged.status === 'ACTIVE'
        ? (
            await this.buildOccurrences(
              {
                validFrom: range.validFrom,
                validTo: range.validTo,
                weekday: merged.weekday,
                startTime: merged.startTime,
                durationMinutes: merged.durationMinutes,
              },
              range.validFrom > today ? range.validFrom : today,
              merged.branchId,
            )
          ).filter((occurrence) => occurrence.endsAt >= new Date())
        : [];

    const conflicts = occurrences.length
      ? await this.findConflicts(occurrences, {
          teacherId: merged.teacherId,
          roomId: merged.roomId,
          studentIds,
          excludeSeriesId: id,
        })
      : [];
    if (conflicts.length) this.throwConflicts(conflicts);

    await this.prisma.$transaction(async (tx) => {
      await tx.lessonSeries.update({
        where: { id },
        data: {
          branchId: merged.branchId,
          roomId: merged.roomId,
          teacherId: merged.teacherId,
          programId: merged.programId,
          levelId: merged.levelId,
          type: merged.type,
          title: merged.title,
          weekday: merged.weekday,
          startTime: merged.startTime,
          durationMinutes: merged.durationMinutes,
          validFrom: new Date(`${range.validFrom}T00:00:00.000Z`),
          validTo: new Date(`${range.validTo}T00:00:00.000Z`),
          status: merged.status,
        },
     });

      await tx.lessonSeriesStudent.deleteMany({ where: { lessonSeriesId: id}});
      if (studentIds.length) {
        await tx.lessonSeriesStudent.createMany({
          data: studentIds.map((studentId) => ({
            tenantId: this.ctx.tenantId,
            lessonSeriesId: id,
            studentId,
          })),
          skipDuplicates: true,
       });
      }

      await tx.lesson.deleteMany({
        where: {
          lessonSeriesId: id,
          startsAt: { gte: new Date() },
          status: { in: ['SCHEDULED', 'RESCHEDULED'] },
        },
     });

      if (merged.status === 'ACTIVE' && occurrences.length) {
        await this.materialize(tx, { ...existing, ...merged }, occurrences, studentIds);
      }
   });

    await this.audit.record('lessonSeries.updated', 'LessonSeries', id, {
      fields: Object.keys(dto),
   });
    return this.getSeries(id);
  }

  async endSeries(id: string) {
    const series = await this.prisma.lessonSeries.findFirst({
      where: { id, tenantId: this.ctx.tenantId },
   });
    if (!series) throw new NotFoundException('Το πρόγραμμα δεν βρέθηκε');

    await this.prisma.$transaction([
      this.prisma.lessonSeries.update({ where: { id }, data: { status: 'ENDED' } }),
      this.prisma.lesson.deleteMany({
        where: {
          lessonSeriesId: id,
          startsAt: { gte: new Date() },
          status: { in: ['SCHEDULED', 'RESCHEDULED'] },
        },
      }),
    ]);
    await this.audit.record('lessonSeries.ended', 'LessonSeries', id);
    return { success: true };
  }

  /**
   * Trashes a series and cancels its future lessons. Recoverable via `restoreSeries`,
   * which re-materialises the occurrences. `endSeries` remains the explicit way to
   * finish a series permanently without removing it from history.
   */
  async removeSeries(id: string) {
    const series = await this.prisma.lessonSeries.findFirst({
      where: { id, tenantId: this.ctx.tenantId },
         });
    if (!series) throw new NotFoundException('Το πρόγραμμα δεν βρέθηκε');
    await this.prisma.$transaction(async (tx) => {
      // The series is soft-deleted, so its unique (series, start) key still
      // reserves the slot; future occurrences are removed explicitly and are
      // re-materialised by `restoreSeries`.
      await tx.lessonSeries.delete({ where: { id}});
      const future = await tx.lesson.findMany({
        where: {
          lessonSeriesId: id,
          startsAt: { gte: new Date() },
          status: { in: ['SCHEDULED', 'RESCHEDULED'] },
        },
        select: { id: true },
     });
      const ids = future.map((lesson) => lesson.id);
      if (ids.length) {
        // Notes and attendance reference lessons with FK RESTRICT.
        await tx.attendance.deleteMany({
          where: { lessonId: { in: ids } },
        });
        await tx.lessonNote.deleteMany({
          where: { lessonId: { in: ids } },
        });
      }
    });
    await this.audit.record('lessonSeries.deleted', 'LessonSeries', id);
    return { success: true };
  }

  async restoreSeries(id: string) {
    const series = await this.prisma.lessonSeries.findFirst({
      where: { id, tenantId: this.ctx.tenantId, deletedAt: { not: null } },
      include: { students: true },
    });
    if (!series) throw new NotFoundException('Το πρόγραμμα δεν βρέθηκε');

    const restored = await this.prisma.lessonSeries.update({
      where: { id },
      data: { deletedAt: null, deletedById: null },
    });

    // Trashing cancelled the future occurrences; bring them back from the
    // series definition rather than trying to resurrect deleted lesson rows.
    const range = await this.resolveRange(
      isoDate(restored.validFrom),
      restored.validTo ? isoDate(restored.validTo) : undefined,
    );
    const today = isoDate(new Date());
    const occurrences = await this.buildOccurrences(
      {
        validFrom: range.validFrom,
        validTo: range.validTo,
        weekday: restored.weekday,
        startTime: restored.startTime,
        durationMinutes: restored.durationMinutes,
      },
      range.validFrom > today ? range.validFrom : today,
      restored.branchId,
    );

    await this.prisma.$transaction((tx) =>
      this.materialize(
        tx,
        restored,
        occurrences,
        series.students.map((row) => row.studentId),
      ),
    );

    await this.audit.record('lessonSeries.restored', 'LessonSeries', id);
    return { success: true };
  }

  async getSeries(id: string) {
    const series = await this.prisma.lessonSeries.findFirst({
      where: { id, tenantId: this.ctx.tenantId },
      include: {
        branch: true,
        room: true,
        teacher: { select: { id: true, firstName: true, lastName: true } },
        program: true,
        level: true,
        students: {
          include: {
            student: {
              select: { id: true, firstName: true, lastName: true, registrationNumber: true },
            },
          },
        },
        _count: { select: { lessons: true } },
      },
         });
    if (!series) throw new NotFoundException('Το πρόγραμμα δεν βρέθηκε');
    return series;
  }

  async listLessons(query: LessonQueryDto) {
    const today = isoDate(new Date());
    const weekOffset = (isoWeekday(today) - 1) % 7;
    const from = query.from ?? addDays(today, -weekOffset);
    const to = query.to ?? addDays(from, 6);
    const rangeStart = startOfDay(from);
    const rangeEnd = endOfDay(to);
    if (rangeEnd < rangeStart) {
      throw new BadRequestException('Μη έγκυρο εύρος ημερομηνιών');
    }
    if (daysBetween(from, to) > MAX_QUERY_DAYS) {
      throw new BadRequestException('Το εύρος αναζήτησης είναι πολύ μεγάλο');
    }

    const where: Prisma.LessonWhereInput = {
      tenantId: this.ctx.tenantId,
      startsAt: { gte: rangeStart, lte: rangeEnd },
    };
    if (query.branchId) where.branchId = query.branchId;
    if (query.teacherId) where.teacherId = query.teacherId;
    if (query.roomId) where.roomId = query.roomId;
    if (query.status) where.status = query.status;
    if (query.programId) where.lessonSeries = { programId: query.programId };

    if (this.scope.isTeacher) {
      where.teacherId = await this.scope.requireTeacherId();
    } else if (this.scope.isStudent) {
      const studentId = await this.scope.requireStudentId();
      where.students = { some: { studentId } };
    } else if (query.studentId) {
      where.students = { some: { studentId: query.studentId } };
    }

    const lessons = await this.prisma.lesson.findMany({
      where,
      include: lessonInclude,
      orderBy: { startsAt: 'asc' },
         });

    return {
      data: lessons,
      meta: { from, to, count: lessons.length },
    };
  }

  async getLesson(id: string) {
    const lesson = await this.prisma.lesson.findFirst({
      where: { id, tenantId: this.ctx.tenantId },
      include: {
        ...lessonInclude,
        notes: {
          include: { author: { select: { id: true, firstName: true, lastName: true } } },
          orderBy: { createdAt: 'desc' },
        },
      },
         });
    if (!lesson) throw new NotFoundException('Το μάθημα δεν βρέθηκε');
    await this.assertLessonAccess(lesson);
    return lesson;
  }

  async rescheduleLesson(id: string, dto: RescheduleLessonDto) {
    const lesson = await this.prisma.lesson.findFirst({
      where: { id, tenantId: this.ctx.tenantId },
      include: {
        students: { select: { studentId: true } },
        teacher: { select: { firstName: true, lastName: true } },
      },
         });
    if (!lesson) throw new NotFoundException('Το μάθημα δεν βρέθηκε');
    if (lesson.status === 'CANCELLED') {
      throw new ConflictException('Δεν μπορεί να μεταφερθεί ακυρωμένο μάθημα');
    }

    const startsAt = new Date(dto.startsAt);
    if (Number.isNaN(startsAt.getTime())) {
      throw new BadRequestException('Μη έγκυρη ημερομηνία');
    }
    const duration = lesson.endsAt.getTime() - lesson.startsAt.getTime();
    const endsAt = new Date(startsAt.getTime() + duration);
    if (startsAt.getTime() === lesson.startsAt.getTime()) {
      throw new BadRequestException('Η νέα ώρα είναι ίδια με την τρέχουσα');
    }

    const teacherId = dto.teacherId ?? lesson.teacherId;
    const roomId = dto.roomId ?? lesson.roomId;
    await this.assertLessonResources(lesson.branchId, teacherId, roomId);
    const studentIds = lesson.students.map((row) => row.studentId);

    const conflicts = await this.findConflicts([{ startsAt, endsAt }], {
      teacherId,
      roomId,
      studentIds,
      excludeLessonId: id,
         });
    if (conflicts.length) this.throwConflicts(conflicts);

    try {
      await this.prisma.lesson.update({
        where: { id },
        data: {
          startsAt,
          endsAt,
          teacherId,
          roomId,
          status: 'SCHEDULED',
          originalStartsAt: lesson.originalStartsAt ?? lesson.startsAt,
          cancellationReason: null,
        },
     });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Υπάρχει ήδη μάθημα αυτής της σειράς σε αυτή την ώρα');
      }
      throw error;
    }

    await this.notifications.notifyLessonParticipants(
      id,
      'LESSON_CHANGED',
      'Αλλαγή ώρας μαθήματος',
      `Το μάθημα «${lesson.title}» μεταφέρθηκε στις ${formatSlot(startsAt)}.`,
    );
    await this.audit.record('lesson.rescheduled', 'Lesson', id, {
      from: lesson.startsAt.toISOString(),
      to: startsAt.toISOString(),
      reason: dto.reason,
         });
    return this.getLesson(id);
  }

  async cancelLesson(id: string, dto: CancelLessonDto) {
    const lesson = await this.prisma.lesson.findFirst({
      where: { id, tenantId: this.ctx.tenantId },
         });
    if (!lesson) throw new NotFoundException('Το μάθημα δεν βρέθηκε');
    if (lesson.status === 'CANCELLED') {
      throw new ConflictException('Το μάθημα είναι ήδη ακυρωμένο');
    }

    await this.prisma.lesson.update({
      where: { id },
      data: { status: 'CANCELLED', cancellationReason: dto.reason },
         });
    await this.notifications.notifyLessonParticipants(
      id,
      'LESSON_CANCELLED',
      'Ακύρωση μαθήματος',
      `Το μάθημα «${lesson.title}» στις ${formatSlot(lesson.startsAt)} ακυρώθηκε. ${dto.reason}`,
    );
    await this.audit.record('lesson.cancelled', 'Lesson', id, { reason: dto.reason});
    return this.getLesson(id);
  }

  async checkConflicts(dto: ConflictCheckDto) {
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    if (endsAt <= startsAt) {
      throw new BadRequestException('Η λήξη πρέπει να είναι μετά την έναρξη');
    }
    const teacher = await this.prisma.teacher.findFirst({
      where: { id: dto.teacherId, tenantId: this.ctx.tenantId },
         });
    if (!teacher) throw new NotFoundException('Ο καθηγητής δεν βρέθηκε');
    const room = await this.prisma.room.findFirst({
      where: { id: dto.roomId, tenantId: this.ctx.tenantId },
         });
    if (!room) throw new NotFoundException('Η αίθουσα δεν βρέθηκε');

    const conflicts = await this.findConflicts([{ startsAt, endsAt }], {
      teacherId: dto.teacherId,
      roomId: dto.roomId,
      studentIds: dto.studentIds,
      excludeLessonId: dto.excludeLessonId,
      excludeSeriesId: dto.excludeSeriesId,
         });
    return {
      hasConflicts: conflicts.length > 0,
      conflicts: conflicts.map((conflict) => ({
        startsAt: conflict.startsAt,
        reason: conflict.reason,
      })),
    };
  }

  private async materialize(
    tx: Prisma.TransactionClient,
    series: {
      id: string;
      branchId: string;
      roomId: string;
      teacherId: string;
      title: string;
      type: string;
    },
    occurrences: Occurrence[],
    studentIds: string[],
  ): Promise<void> {
    const tenantId = this.ctx.tenantId;
    await tx.lesson.createMany({
      data: occurrences.map((occurrence) => ({
        tenantId,
        lessonSeriesId: series.id,
        branchId: series.branchId,
        roomId: series.roomId,
        teacherId: series.teacherId,
        title: series.title,
        type: series.type as 'INDIVIDUAL' | 'GROUP' | 'ENSEMBLE',
        startsAt: occurrence.startsAt,
        endsAt: occurrence.endsAt,
        status: occurrence.endsAt < new Date() ? 'COMPLETED' : 'SCHEDULED',
      })),
      skipDuplicates: true,
         });

    const lessons = await tx.lesson.findMany({
      where: {
        lessonSeriesId: series.id,
        startsAt: { in: occurrences.map((occurrence) => occurrence.startsAt) },
      },
      select: { id: true },
         });
    if (lessons.length && studentIds.length) {
      await tx.lessonStudent.createMany({
        data: lessons.flatMap((lesson) =>
          studentIds.map((studentId) => ({
            tenantId,
            lessonId: lesson.id,
            studentId,
          })),
        ),
        skipDuplicates: true,
     });
    }
  }

  /**
   * Builds the weekly occurrences, skipping days that the tenant calendar marks
   * as holidays or closures for this branch. Exposed for callers that need the
   * dates before committing (e.g. change previews).
   */
  private async buildOccurrences(
    config: {
      validFrom: string;
      validTo: string;
      weekday: number;
      startTime: string;
      durationMinutes: number;
    },
    from: string,
    branchId: string,
  ): Promise<Occurrence[]> {
    const holidays = await this.loadCalendarDays(config.validFrom, config.validTo, branchId);
    try {
      return buildRecurrence(config, {
        from,
        timeZone: TZ,
        holidays,
        branchId,
        maxOccurrences: MAX_LESSONS_PER_SERIES,
     });
    } catch (error) {
      if (error instanceof RangeError) {
        throw new BadRequestException('Το διάστημα παράγει υπερβολικά πολλά μαθήματα');
      }
      throw error;
    }
  }

  /**
   * Loads the calendar rules that apply to a date range: tenant-wide rules plus
   * anything scoped to the branch (or to any branch when `branchId` is absent).
   */
  private async loadCalendarDays(
    from: string,
    to: string,
    branchId?: string,
  ): Promise<Map<string, CalendarDayRule[]>> {
    const rows = await this.prisma.calendarDay.findMany({
      where: {
        tenantId: this.ctx.tenantId,
        date: { gte: new Date(`${from}T00:00:00.000Z`), lte: new Date(`${to}T00:00:00.000Z`) },
        ...(branchId ? { OR: [{ branchId: null }, { branchId }] } : {}),
      },
      select: { date: true, kind: true, branchId: true },
         });
    return groupRules(
      rows.map((row) => ({
        date: isoDate(row.date),
        kind: row.kind,
        branchId: row.branchId,
      })),
    );
  }

  private async resolveRange(
    validFromInput: string,
    validToInput?: string,
  ): Promise<{ validFrom: string; validTo: string }> {
    const validFrom = isoDate(validFromInput);
    let validTo = validToInput ? isoDate(validToInput) : null;
    if (!validTo) {
      const year = await this.prisma.academicYear.findFirst({
        where: { tenantId: this.ctx.tenantId, isActive: true },
        orderBy: { startsOn: 'desc' },
     });
      validTo = year ? isoDate(year.endsOn) : addDays(validFrom, 300);
    }
    if (validTo < validFrom) {
      throw new BadRequestException('Η ημερομηνία λήξης πρέπει να είναι μετά την έναρξη');
    }
    if (daysBetween(validFrom, validTo) > MAX_RANGE_DAYS) {
      throw new BadRequestException('Το διάστημα ισχύος υπερβαίνει τους 13 μήνες');
    }
    return { validFrom, validTo };
  }

  private async assertSeriesRefs(
    input: {
      branchId: string;
      roomId: string;
      teacherId: string;
      programId: string;
      levelId?: string | null;
    },
    studentIds: string[],
  ) {
    const tenantId = this.ctx.tenantId;
    const [branch, room, teacher, program, level, students] = await Promise.all([
      this.prisma.branch.findFirst({ where: { id: input.branchId, tenantId } }),
      this.prisma.room.findFirst({ where: { id: input.roomId, tenantId } }),
      this.prisma.teacher.findFirst({ where: { id: input.teacherId, tenantId } }),
      this.prisma.program.findFirst({ where: { id: input.programId, tenantId } }),
      input.levelId
        ? this.prisma.level.findFirst({ where: { id: input.levelId, tenantId } })
        : Promise.resolve(true),
      this.prisma.student.count({ where: { tenantId, id: { in: studentIds } } }),
    ]);
    if (!branch) throw new NotFoundException('Το παράρτημα δεν βρέθηκε');
    if (!room || room.branchId !== input.branchId) {
      throw new BadRequestException('Η αίθουσα δεν ανήκει στο επιλεγμένο παράρτημα');
    }
    if (!teacher) throw new NotFoundException('Ο καθηγητής δεν βρέθηκε');
    if (!program) throw new NotFoundException('Το πρόγραμμα δεν βρέθηκε');
    if (!level) throw new NotFoundException('Το επίπεδο δεν βρέθηκε');
    if (students !== studentIds.length) {
      throw new BadRequestException('Ένας ή περισσότεροι μαθητές δεν ανήκουν στο ωδείο');
    }
  }

  private async assertLessonResources(branchId: string, teacherId: string, roomId: string | null) {
    const tenantId = this.ctx.tenantId;
    const [teacher, room] = await Promise.all([
      this.prisma.teacher.findFirst({ where: { id: teacherId, tenantId } }),
      roomId
        ? this.prisma.room.findFirst({ where: { id: roomId, tenantId } })
        : Promise.resolve(null),
    ]);
    if (!teacher) throw new NotFoundException('Ο καθηγητής δεν βρέθηκε');
    if (roomId && !room) throw new NotFoundException('Η αίθουσα δεν βρέθηκε');
    if (room && room.branchId !== branchId) {
      throw new BadRequestException('Η αίθουσα δεν ανήκει στο παράρτημα του μαθήματος');
    }
  }

  private async findConflicts(
    occurrences: Occurrence[],
    options: ConflictOptions,
  ): Promise<Conflict[]> {
    if (!occurrences.length) return [];
    const tenantId = this.ctx.tenantId;
    const minStart = new Date(Math.min(...occurrences.map((o) => o.startsAt.getTime())));
    const maxEnd = new Date(Math.max(...occurrences.map((o) => o.endsAt.getTime())));
    const studentIds = options.studentIds ?? [];

    const or: Prisma.LessonWhereInput[] = [{ teacherId: options.teacherId }];
    if (options.roomId) or.push({ roomId: options.roomId});
    if (studentIds.length) {
      or.push({ students: { some: { studentId: { in: studentIds } } }});
    }

    const notFilters: Prisma.LessonWhereInput[] = [];
    if (options.excludeLessonId) notFilters.push({ id: options.excludeLessonId});
    if (options.excludeSeriesId) notFilters.push({ lessonSeriesId: options.excludeSeriesId});

    const existing = await this.prisma.lesson.findMany({
      where: {
        tenantId,
        status: { not: 'CANCELLED' },
        startsAt: { lt: maxEnd },
        endsAt: { gt: minStart },
        OR: or,
        ...(notFilters.length ? { NOT: notFilters } : {}),
      },
      include: {
        teacher: { select: { firstName: true, lastName: true } },
        room: { select: { name: true } },
        students: { select: { studentId: true } },
      },
         });

    const conflicts: Conflict[] = [];
    const seen = new Set<string>();
    for (const occurrence of occurrences) {
      for (const lesson of existing) {
        if (lesson.startsAt >= occurrence.endsAt || lesson.endsAt <= occurrence.startsAt) continue;
        const reasons: string[] = [];
        if (lesson.teacherId === options.teacherId) {
          reasons.push(
            `ο καθηγητής ${lesson.teacher.firstName} ${lesson.teacher.lastName} έχει μάθημα`,
          );
        }
        if (options.roomId && lesson.roomId === options.roomId) {
          reasons.push(`η αίθουσα ${lesson.room?.name ?? ''} είναι κατειλημμένη`);
        }
        if (studentIds.length) {
          const shared = lesson.students.filter((row) => studentIds.includes(row.studentId));
          if (shared.length) {
            reasons.push(`${shared.length} μαθητής/-ές έχουν άλλο μάθημα`);
          }
        }
        if (reasons.length) {
          const key = `${occurrence.startsAt.toISOString()}|${reasons.join(',')}`;
          if (!seen.has(key)) {
            seen.add(key);
            conflicts.push({
              startsAt: occurrence.startsAt,
              reason: `${formatSlot(occurrence.startsAt)}: ${reasons.join(', ')}`,
           });
          }
        }
      }
    }
    return conflicts.slice(0, 8);
  }

  private throwConflicts(conflicts: Conflict[]): never {
    const summary = conflicts.slice(0, 3).map((conflict) => conflict.reason).join(' · ');
    throw new ConflictException(`Σύγκρουση προγράμματος — ${summary}`);
  }

  private async assertLessonAccess(lesson: {
    teacherId: string;
    students: { student: { id: string } }[];
  }) {
    if (this.scope.isTeacher) {
      const teacherId = await this.scope.requireTeacherId();
      if (lesson.teacherId !== teacherId) {
        throw new NotFoundException('Το μάθημα δεν βρέθηκε');
      }
    } else if (this.scope.isStudent) {
      const studentId = await this.scope.requireStudentId();
      if (!lesson.students.some((row) => row.student.id === studentId)) {
        throw new NotFoundException('Το μάθημα δεν βρέθηκε');
      }
    }
  }
}
