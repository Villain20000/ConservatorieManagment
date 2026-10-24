import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../../common/audit.service.js';
import { pageMeta } from '../../common/dto/pagination.dto.js';
import { ScopeService } from '../../common/scope.service.js';
import { TenantContextService } from '../../common/tenant-context.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import type {
  AttendanceQueryDto,
  LessonNoteDto,
  SaveAttendanceDto,
} from './dto/attendance.dto.js';

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: TenantContextService,
    private readonly scope: ScopeService,
    private readonly audit: AuditService,
  ) {}

  async getRoster(lessonId: string) {
    this.assertNotStudent();
    const lesson = await this.loadLesson(lessonId);
    await this.assertTeacherOwnsLesson(lesson);

    const rows = await this.prisma.lessonStudent.findMany({
      where: { lessonId, tenantId: this.ctx.tenantId },
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            registrationNumber: true,
            status: true,
          },
        },
      },
      orderBy: { student: { lastName: 'asc' } },
    });
    const attendance = await this.prisma.attendance.findMany({
      where: { lessonId, tenantId: this.ctx.tenantId },
    });
    const byStudent = new Map(attendance.map((row) => [row.studentId, row]));

    return {
      lesson,
      students: rows.map((row) => ({
        student: row.student,
        attendance: byStudent.get(row.studentId) ?? null,
      })),
      summary: this.summarize(attendance),
    };
  }

  async saveAttendance(lessonId: string, dto: SaveAttendanceDto) {
    this.assertNotStudent();
    const lesson = await this.loadLesson(lessonId);
    await this.assertTeacherOwnsLesson(lesson);

    const roster = await this.prisma.lessonStudent.findMany({
      where: { lessonId, tenantId: this.ctx.tenantId },
      select: { studentId: true },
    });
    const rosterIds = new Set(roster.map((row) => row.studentId));
    const unknown = dto.records.filter((record) => !rosterIds.has(record.studentId));
    if (unknown.length) {
      throw new BadRequestException('Υπάρχουν μαθητές που δεν ανήκουν στο μάθημα');
    }
    if (new Set(dto.records.map((record) => record.studentId)).size !== dto.records.length) {
      throw new BadRequestException('Υπάρχουν διπλές εγγραφές παρουσιολογίου');
    }

    await this.prisma.$transaction([
      ...dto.records.map((record) =>
        this.prisma.attendance.upsert({
          where: {
            lessonId_studentId: { lessonId, studentId: record.studentId },
          },
          create: {
            tenantId: this.ctx.tenantId,
            lessonId,
            studentId: record.studentId,
            status: record.status,
            minutesLate: record.status === 'LATE' ? (record.minutesLate ?? null) : null,
            notes: record.notes ?? null,
            markedById: this.ctx.userId,
            markedAt: new Date(),
          },
          update: {
            status: record.status,
            minutesLate: record.status === 'LATE' ? (record.minutesLate ?? null) : null,
            notes: record.notes ?? null,
            markedById: this.ctx.userId,
            markedAt: new Date(),
          },
        }),
      ),
      this.prisma.lesson.update({
        where: { id: lessonId },
        data: { status: 'COMPLETED' },
      }),
    ]);

    await this.audit.record('attendance.saved', 'Lesson', lessonId, {
      records: dto.records.length,
    });
    return this.getRoster(lessonId);
  }

  async listAttendance(query: AttendanceQueryDto) {
    const where: Prisma.AttendanceWhereInput = { tenantId: this.ctx.tenantId };
    if (query.lessonId) where.lessonId = query.lessonId;
    if (query.status) where.status = query.status;

    if (this.scope.isTeacher) {
      where.lesson = { teacherId: await this.scope.requireTeacherId() };
    } else if (this.scope.isStudent) {
      const studentId = await this.scope.requireStudentId();
      where.studentId = studentId;
    } else if (query.studentId) {
      where.studentId = query.studentId;
    }

    if (query.from || query.to) {
      const from = query.from ? new Date(query.from) : new Date('2000-01-01T00:00:00Z');
      const to = query.to ? new Date(query.to) : new Date('2100-01-01T00:00:00Z');
      where.lesson = {
        ...(where.lesson as Prisma.LessonWhereInput | undefined),
        startsAt: { gte: from, lte: to },
      };
    }

    const [total, data] = await Promise.all([
      this.prisma.attendance.count({ where }),
      this.prisma.attendance.findMany({
        where,
        include: {
          student: {
            select: { id: true, firstName: true, lastName: true, registrationNumber: true },
          },
          lesson: {
            select: {
              id: true,
              title: true,
              startsAt: true,
              endsAt: true,
              status: true,
              teacher: { select: { firstName: true, lastName: true } },
            },
          },
          markedBy: { select: { firstName: true, lastName: true } },
        },
        orderBy: { lesson: { startsAt: 'desc' } },
        skip: query.skip,
        take: query.pageSize,
      }),
    ]);
    return { data, meta: pageMeta(total, query.page, query.pageSize) };
  }

  async attendanceSummary(studentId: string) {
    await this.scope.assertStudentAccessible(studentId);
    const groups = await this.prisma.attendance.groupBy({
      by: ['status'],
      where: { tenantId: this.ctx.tenantId, studentId },
      _count: { _all: true },
    });
    const summary = { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0, total: 0 };
    for (const group of groups) {
      summary[group.status] = group._count._all;
      summary.total += group._count._all;
    }
    return {
      ...summary,
      rate:
        summary.total === 0
          ? null
          : Math.round(((summary.PRESENT + summary.LATE) / summary.total) * 100),
    };
  }

  async addNote(lessonId: string, dto: LessonNoteDto) {
    this.assertNotStudent();
    const lesson = await this.loadLesson(lessonId);
    await this.assertTeacherOwnsLesson(lesson);
    const note = await this.prisma.lessonNote.create({
      data: {
        tenantId: this.ctx.tenantId,
        lessonId,
        authorId: this.ctx.userId,
        content: dto.content,
      },
      include: {
        author: { select: { firstName: true, lastName: true } },
      },
    });
    await this.audit.record('lesson.note.added', 'Lesson', lessonId);
    return note;
  }

  async removeNote(lessonId: string, noteId: string) {
    this.assertNotStudent();
    const lesson = await this.loadLesson(lessonId);
    await this.assertTeacherOwnsLesson(lesson);
    const note = await this.prisma.lessonNote.findFirst({
      where: { id: noteId, lessonId, tenantId: this.ctx.tenantId },
    });
    if (!note) throw new NotFoundException('Η σημείωση δεν βρέθηκε');
    if (note.authorId !== this.ctx.userId && !this.scope.isAdministrator) {
      throw new ForbiddenException('Μπορείτε να διαγράψετε μόνο δικές σας σημειώσεις');
    }
    await this.prisma.lessonNote.delete({ where: { id: noteId } });
    await this.audit.record('lesson.note.removed', 'Lesson', lessonId);
    return { success: true };
  }

  private async loadLesson(lessonId: string) {
    const lesson = await this.prisma.lesson.findFirst({
      where: { id: lessonId, tenantId: this.ctx.tenantId },
      include: {
        teacher: { select: { id: true, firstName: true, lastName: true } },
        room: { select: { id: true, name: true } },
        branch: { select: { id: true, name: true } },
        lessonSeries: {
          select: {
            program: { select: { id: true, name: true } },
            level: { select: { id: true, name: true } },
          },
        },
        notes: {
          include: { author: { select: { firstName: true, lastName: true } } },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!lesson) throw new NotFoundException('Το μάθημα δεν βρέθηκε');
    return lesson;
  }

  private async assertTeacherOwnsLesson(lesson: { teacherId: string }) {
    if (this.scope.isTeacher) {
      const teacherId = await this.scope.requireTeacherId();
      if (lesson.teacherId !== teacherId) {
        throw new NotFoundException('Το μάθημα δεν βρέθηκε');
      }
    }
  }

  private assertNotStudent() {
    if (this.scope.isStudent) {
      throw new ForbiddenException('Η ενέργεια αφορά εκπαιδευτικό προσωπικό');
    }
  }

  private summarize(rows: { status: string }[]) {
    const summary = { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0, total: rows.length };
    for (const row of rows) {
      if (row.status in summary && row.status !== 'total') {
        summary[row.status as 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED'] += 1;
      }
    }
    return summary;
  }
}
