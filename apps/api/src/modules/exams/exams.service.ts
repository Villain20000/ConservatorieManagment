import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../../common/audit.service.js';
import { NotificationsService } from '../../common/notifications.service.js';
import { ScopeService } from '../../common/scope.service.js';
import { TenantContextService } from '../../common/tenant-context.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import type { ExamCommitteeRole, ExamOutcome } from '../../generated/prisma/enums.js';
import { DocumentsService } from '../documents/documents.service.js';
import { OutboxService } from '../../infrastructure/outbox/outbox.service.js';
import {
  type CreateExamApplicationDto,
  type CreateExamDto,
  type CreateExamPeriodDto,
  type DecideExamApplicationDto,
  type ExamQueryDto,
  type SaveExamResultsDto,
  type SetCommitteeDto,
  type UpdateExamDto,
} from './dto/exams.dto.js';

const WRITABLE_STATUSES = ['SCHEDULED', 'GRADING', 'PENDING_APPROVAL'] as const;
const CLOSED_STATUSES = ['PUBLISHED', 'ARCHIVED', 'CANCELLED'] as const;
const ROLE_ORDER: Record<ExamCommitteeRole, number> = { PRESIDENT: 0, EXAMINER: 1, MEMBER: 2 };

@Injectable()
export class ExamsService {
  private readonly logger = new Logger(ExamsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: TenantContextService,
    private readonly scope: ScopeService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly outbox: OutboxService,
    private readonly documents: DocumentsService,
  ) {}

  async list(query: ExamQueryDto) {
    const where: Prisma.ExamWhereInput = { tenantId: this.ctx.tenantId };
    if (query.programId) where.programId = query.programId;
    if (query.periodId) where.periodId = query.periodId;
    if (query.status) where.status = query.status;
    if (query.from || query.to) {
      where.examDate = {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lte: new Date(query.to) } : {}),
      };
    }

    const exams = await this.prisma.exam.findMany({
      where,
      include: {
        program: { select: { id: true, name: true, color: true } },
        level: { select: { id: true, name: true } },
        period: { select: { id: true, name: true, startsOn: true, endsOn: true } },
        _count: { select: { results: true, applications: true, committee: true, documents: true } },
        results: {
          select: { grade: true, outcome: true, approvedAt: true, publishedAt: true },
        },
      },
      orderBy: { examDate: 'desc' },
    });

    return {
      data: exams.map((exam) => {
        const graded = exam.results.filter((result) => result.grade !== null);
        const average =
          graded.length === 0
            ? null
            : Math.round(
                (graded.reduce((sum, result) => sum + Number(result.grade), 0) /
                  graded.length) *
                  10,
              ) / 10;
        const passed = exam.results.filter((result) => result.outcome === 'PASS').length;
        return {
          ...exam,
          results: undefined,
          averageGrade: average,
          passed,
          participation: exam._count.results,
          approved: exam.results.filter((result) => result.approvedAt !== null).length,
          publishedResults: exam.results.filter((result) => result.publishedAt !== null).length,
          pendingApplications: exam._count.applications,
          committeeSize: exam._count.committee,
          hasMinutes: exam._count.documents > 0,
        };
      }),
    };
  }

  async get(id: string) {
    const exam = await this.prisma.exam.findFirst({
      where: { id, tenantId: this.ctx.tenantId },
      include: {
        program: { select: { id: true, name: true, color: true } },
        level: { select: { id: true, name: true } },
        period: true,
        committee: {
          include: { teacher: { select: { id: true, firstName: true, lastName: true } } },
        },
        applications: {
          include: {
            student: {
              select: { id: true, firstName: true, lastName: true, registrationNumber: true },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
        results: {
          include: {
            student: {
              select: { id: true, firstName: true, lastName: true, registrationNumber: true },
            },
          },
        },
        documents: { select: { id: true, title: true, protocolNumber: true, status: true } },
      },
    });
    if (!exam) throw new NotFoundException('Η εξέταση δεν βρέθηκε');
    return exam;
  }

  async listPeriods() {
    return this.prisma.examPeriod.findMany({
      where: { tenantId: this.ctx.tenantId },
      include: {
        academicYear: { select: { id: true, name: true } },
        _count: { select: { exams: true } },
      },
      orderBy: [{ startsOn: 'desc' }],
    });
  }

  async createPeriod(dto: CreateExamPeriodDto) {
    const year = await this.prisma.academicYear.findFirst({
      where: { id: dto.academicYearId, tenantId: this.ctx.tenantId },
      select: { id: true },
    });
    if (!year) throw new NotFoundException('Το ακαδημαϊκό έτος δεν βρέθηκε');
    const startsOn = dateOnly(dto.startsOn);
    const endsOn = dateOnly(dto.endsOn);
    if (endsOn < startsOn) {
      throw new BadRequestException('Η λήξη της περιόδου προηγείται της έναρξης');
    }
    try {
      const period = await this.prisma.examPeriod.create({
        data: {
          tenantId: this.ctx.tenantId,
          academicYearId: dto.academicYearId,
          name: dto.name.trim(),
          startsOn,
          endsOn,
          status: dto.status ?? 'PLANNED',
        },
      });
      await this.audit.record('exam_period.created', 'ExamPeriod', period.id, {
        name: period.name,
      });
      return period;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException({
          code: 'EXAM_PERIOD_EXISTS',
          message: 'Υπάρχει ήδη περίοδος με αυτό το όνομα',
        });
      }
      throw error;
    }
  }

  async create(dto: CreateExamDto) {
    await this.validateReferences(dto.programId, dto.levelId, dto.periodId);
    const exam = await this.prisma.exam.create({
      data: {
        tenantId: this.ctx.tenantId,
        programId: dto.programId,
        levelId: dto.levelId ?? null,
        periodId: dto.periodId ?? null,
        title: dto.title.trim(),
        type: dto.type ?? 'PERIODIC',
        examDate: new Date(dto.examDate),
        gradingDeadline: dto.gradingDeadline ? new Date(dto.gradingDeadline) : null,
        location: dto.location?.trim() || null,
        notes: dto.notes?.trim() || null,
        status: 'SCHEDULED',
        createdById: this.ctx.userId,
      },
      include: {
        program: { select: { id: true, name: true, color: true } },
        level: { select: { id: true, name: true } },
      },
    });
    await this.audit.record('exam.created', 'Exam', exam.id, {
      title: exam.title,
      type: exam.type,
    });
    return exam;
  }

  async update(id: string, dto: UpdateExamDto) {
    const exam = await this.requireExam(id);
    if (isClosed(exam.status)) {
      throw new ConflictException({
        code: 'EXAM_LOCKED',
        message: 'Η εξέταση έχει δημοσιευτεί ή ακυρωθεί και δεν επεξεργάζεται',
      });
    }
    if (dto.programId || dto.levelId !== undefined || dto.periodId !== undefined) {
      await this.validateReferences(
        dto.programId ?? exam.programId,
        dto.levelId === null ? undefined : (dto.levelId ?? exam.levelId ?? undefined),
        dto.periodId === null ? undefined : (dto.periodId ?? exam.periodId ?? undefined),
      );
    }
    const updated = await this.prisma.exam.update({
      where: { id: exam.id },
      data: {
        ...(dto.programId ? { programId: dto.programId } : {}),
        ...(dto.levelId !== undefined ? { levelId: dto.levelId || null } : {}),
        ...(dto.periodId !== undefined ? { periodId: dto.periodId || null } : {}),
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.examDate !== undefined ? { examDate: new Date(dto.examDate) } : {}),
        ...(dto.gradingDeadline !== undefined
          ? { gradingDeadline: dto.gradingDeadline ? new Date(dto.gradingDeadline) : null }
          : {}),
        ...(dto.location !== undefined ? { location: dto.location?.trim() || null } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes?.trim() || null } : {}),
      },
    });
    await this.audit.record('exam.updated', 'Exam', exam.id);
    return updated;
  }

  async cancel(id: string) {
    const exam = await this.requireExam(id);
    if (exam.status === 'PUBLISHED') {
      throw new ConflictException({
        code: 'EXAM_PUBLISHED',
        message: 'Δεν ακυρώνεται δημοσιευμένη εξέταση',
      });
    }
    if (exam.status === 'CANCELLED') return exam;
    const updated = await this.prisma.exam.update({
      where: { id: exam.id },
      data: { status: 'CANCELLED' },
    });
    await this.audit.record('exam.cancelled', 'Exam', exam.id);
    return updated;
  }

  async committee(examId: string) {
    await this.requireExam(examId);
    const members = await this.prisma.examCommitteeMember.findMany({
      where: { examId, tenantId: this.ctx.tenantId },
      include: {
        teacher: {
          select: { id: true, firstName: true, lastName: true, specialties: true },
        },
      },
    });
    return members.sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role]);
  }

  async setCommittee(examId: string, dto: SetCommitteeDto) {
    const exam = await this.requireExam(examId);
    if (isClosed(exam.status)) {
      throw new ConflictException({ code: 'EXAM_LOCKED', message: 'Η εξέταση έχει κλείσει' });
    }
    const teacherIds = [...new Set(dto.members.map((member) => member.teacherId))];
    if (teacherIds.length !== dto.members.length) {
      throw new BadRequestException('Ο ίδιος καθηγητής δεν μπορεί να έχει δύο ρόλους');
    }
    if (dto.members.filter((member) => member.role === 'PRESIDENT').length > 1) {
      throw new BadRequestException('Η επιτροπή μπορεί να έχει μόνο έναν πρόεδρο');
    }
    const teachers = await this.prisma.teacher.findMany({
      where: { tenantId: this.ctx.tenantId, id: { in: teacherIds }, status: 'ACTIVE' },
      select: { id: true },
    });
    if (teachers.length !== teacherIds.length) {
      throw new NotFoundException('Κάποιος καθηγητής δεν βρέθηκε');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.examCommitteeMember.deleteMany({ where: { examId, tenantId: this.ctx.tenantId } });
      if (dto.members.length) {
        await tx.examCommitteeMember.createMany({
          data: dto.members.map((member) => ({
            tenantId: this.ctx.tenantId,
            examId,
            teacherId: member.teacherId,
            role: member.role,
          })),
        });
      }
    });
    await this.audit.record('exam.committee_updated', 'Exam', examId, {
      members: dto.members.length,
    });
    return this.committee(examId);
  }

  async applications(examId: string) {
    await this.requireExam(examId);
    return this.prisma.examApplication.findMany({
      where: { examId, tenantId: this.ctx.tenantId },
      include: {
        student: {
          select: { id: true, firstName: true, lastName: true, registrationNumber: true },
        },
        decidedBy: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async apply(examId: string, dto: CreateExamApplicationDto) {
    const exam = await this.requireExam(examId);
    if (isClosed(exam.status)) {
      throw new ConflictException({ code: 'EXAM_CLOSED', message: 'Η εξέταση δεν δέχεται αιτήσεις' });
    }
    await this.assertEligible(exam, dto.studentId);
    const existing = await this.prisma.examApplication.findFirst({
      where: { tenantId: this.ctx.tenantId, examId, studentId: dto.studentId },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException({ code: 'APPLICATION_EXISTS', message: 'Υπάρχει ήδη αίτηση' });
    }
    const application = await this.prisma.examApplication.create({
      data: {
        tenantId: this.ctx.tenantId,
        examId,
        studentId: dto.studentId,
        notes: dto.notes?.trim() || null,
      },
      include: {
        student: { select: { id: true, firstName: true, lastName: true, registrationNumber: true } },
      },
    });
    await this.audit.record('exam.application_created', 'ExamApplication', application.id, {
      examId,
      studentId: dto.studentId,
    });
    return application;
  }

  async decideApplication(examId: string, applicationId: string, dto: DecideExamApplicationDto) {
    await this.requireExam(examId);
    const application = await this.prisma.examApplication.findFirst({
      where: { id: applicationId, examId, tenantId: this.ctx.tenantId },
      include: {
        student: { select: { id: true, firstName: true, lastName: true, userId: true } },
        exam: { select: { id: true, title: true } },
      },
    });
    if (!application) throw new NotFoundException('Η αίτηση δεν βρέθηκε');
    if (application.status !== 'PENDING') {
      throw new ConflictException({
        code: 'APPLICATION_DECIDED',
        message: 'Η αίτηση έχει ήδη αξιολογηθεί',
      });
    }
    if (dto.status === 'PENDING') {
      throw new BadRequestException('Επιλέξτε τελική απόφαση');
    }
    const updated = await this.prisma.examApplication.update({
      where: { id: application.id },
      data: {
        status: dto.status,
        decisionNotes: dto.decisionNotes?.trim() || null,
        decidedById: this.ctx.userId,
        decidedAt: new Date(),
      },
    });
    if (application.student.userId) {
      await this.notifications.createForUsers([application.student.userId], {
        type: 'EXAM_APPLICATION_DECIDED',
        title: 'Απόφαση αίτησης εξέτασης',
        body: `Η αίτησή σας για «${application.exam.title}» ${
          dto.status === 'APPROVED' ? 'εγκρίθηκε' : 'απορρίφθηκε'
        }.`,
        entityType: 'ExamApplication',
        entityId: application.id,
      });
    }
    await this.audit.record('exam.application_decided', 'ExamApplication', application.id, {
      status: dto.status,
    });
    return updated;
  }

  async resultRoster(examId: string) {
    const exam = await this.prisma.exam.findFirst({
      where: { id: examId, tenantId: this.ctx.tenantId },
      include: {
        program: { select: { id: true, name: true, color: true } },
        level: { select: { id: true, name: true } },
        period: { select: { id: true, name: true } },
        committee: {
          include: { teacher: { select: { id: true, firstName: true, lastName: true } } },
        },
        results: true,
        applications: true,
      },
    });
    if (!exam) throw new NotFoundException('Η εξέταση δεν βρέθηκε');

    const eligible = await this.eligibleStudents(exam);
    const teacher = await this.teacherAccess(exam.id);
    let allowedIds: Set<string> | null = null;
    if (teacher.teacherId && !teacher.committee) {
      allowedIds = await this.assignedStudentIds(teacher.teacherId);
    }

    const resultByStudent = new Map(exam.results.map((result) => [result.studentId, result]));
    const applicationByStudent = new Map(
      exam.applications.map((application) => [application.studentId, application]),
    );
    const studentIds = new Set([
      ...eligible.map((student) => student.id),
      ...exam.results.map((result) => result.studentId),
      ...exam.applications.map((application) => application.studentId),
    ]);

    const students = await this.prisma.student.findMany({
      where: {
        tenantId: this.ctx.tenantId,
        id: { in: [...studentIds].filter((id) => !allowedIds || allowedIds.has(id)) },
      },
      select: { id: true, firstName: true, lastName: true, registrationNumber: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });

    const rows = students.map((student) => {
      const result = resultByStudent.get(student.id) ?? null;
      return {
        student,
        eligible: eligible.some((candidate) => candidate.id === student.id),
        application: applicationByStudent.get(student.id) ?? null,
        result: result
          ? {
              ...result,
              grade: result.grade === null ? null : Number(result.grade),
            }
          : null,
      };
    });

    return {
      exam: {
        ...exam,
        results: undefined,
        applications: undefined,
        committee: exam.committee.sort(
          (a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role],
        ),
      },
      students: rows,
      summary: {
        eligible: rows.filter((row) => row.eligible).length,
        graded: rows.filter((row) => row.result?.grade !== null && row.result?.grade !== undefined)
          .length,
        approved: rows.filter((row) => row.result?.approvedAt).length,
        published: rows.filter((row) => row.result?.publishedAt).length,
      },
    };
  }

  async saveResults(examId: string, dto: SaveExamResultsDto) {
    const exam = await this.requireExam(examId);
    if (isClosed(exam.status)) {
      throw new ConflictException({ code: 'EXAM_LOCKED', message: 'Η εξέταση έχει κλείσει' });
    }
    if (!dto.results.length) {
      throw new BadRequestException('Δεν υπάρχουν αποτελέσματα για αποθήκευση');
    }
    const teacher = await this.teacherAccess(exam.id);
    const allowedIds =
      teacher.teacherId && !teacher.committee
        ? await this.assignedStudentIds(teacher.teacherId)
        : null;
    const eligible = new Set((await this.eligibleStudents(exam)).map((student) => student.id));
    const approvedApplications = new Set(
      (
        await this.prisma.examApplication.findMany({
          where: { tenantId: this.ctx.tenantId, examId, status: 'APPROVED' },
          select: { studentId: true },
        })
      ).map((application) => application.studentId),
    );

    for (const row of dto.results) {
      if (allowedIds && !allowedIds.has(row.studentId)) {
        throw new ForbiddenException('Δεν έχετε πρόσβαση σε αυτόν τον μαθητή');
      }
      if (!eligible.has(row.studentId) && !approvedApplications.has(row.studentId)) {
        throw new BadRequestException({
          code: 'EXAM_STUDENT_NOT_ELIGIBLE',
          message: 'Ο μαθητής δεν είναι επιλέξιμος για αυτή την εξέταση',
        });
      }
      if ((row.outcome === 'PASS' || row.outcome === 'FAIL') && row.grade == null) {
        throw new BadRequestException('Απαιτείται βαθμός για τελικό αποτέλεσμα');
      }
    }

    await this.prisma.$transaction(async (tx) => {
      for (const row of dto.results) {
        const grade = row.grade === undefined ? null : row.grade;
        const outcome: ExamOutcome =
          row.outcome ?? (grade === null ? 'PENDING' : grade >= 50 ? 'PASS' : 'FAIL');
        await tx.examResult.upsert({
          where: { examId_studentId: { examId, studentId: row.studentId } },
          create: {
            tenantId: this.ctx.tenantId,
            examId,
            studentId: row.studentId,
            grade,
            outcome,
            notes: row.notes?.trim() || null,
            enteredById: this.ctx.userId,
          },
          update: {
            grade,
            outcome,
            notes: row.notes?.trim() || null,
            enteredById: this.ctx.userId,
            submittedAt: null,
            approvedAt: null,
            approvedById: null,
            publishedAt: null,
          },
        });
      }
      if (exam.status === 'SCHEDULED') {
        await tx.exam.update({ where: { id: examId }, data: { status: 'GRADING' } });
      }
    });

    await this.audit.record('exam.results_saved', 'Exam', examId, {
      count: dto.results.length,
    });
    return this.resultRoster(examId);
  }

  async submitResults(examId: string) {
    const exam = await this.requireExam(examId);
    if (exam.status === 'PUBLISHED' || exam.status === 'CANCELLED') {
      throw new ConflictException({ code: 'EXAM_LOCKED', message: 'Η εξέταση έχει κλείσει' });
    }
    const teacher = await this.teacherAccess(exam.id);
    if (teacher.teacherId && !teacher.committee) {
      throw new ForbiddenException('Μόνο μέλη της επιτροπής υποβάλλουν αποτελέσματα');
    }
    const results = await this.prisma.examResult.findMany({
      where: { tenantId: this.ctx.tenantId, examId },
      select: { id: true, grade: true },
    });
    if (!results.length) {
      throw new BadRequestException('Δεν υπάρχουν καταχωρισμένοι βαθμοί');
    }
    if (results.some((result) => result.grade === null)) {
      throw new BadRequestException('Υπάρχουν μαθητές χωρίς βαθμό');
    }
    await this.prisma.$transaction([
      this.prisma.examResult.updateMany({
        where: { tenantId: this.ctx.tenantId, examId },
        data: { submittedAt: new Date() },
      }),
      this.prisma.exam.update({ where: { id: examId }, data: { status: 'PENDING_APPROVAL' } }),
    ]);
    await this.audit.record('exam.results_submitted', 'Exam', examId, { results: results.length });
    return this.get(examId);
  }

  async approveResults(examId: string) {
    const exam = await this.requireExam(examId);
    if (exam.status !== 'PENDING_APPROVAL') {
      throw new ConflictException({
        code: 'EXAM_NOT_SUBMITTED',
        message: 'Τα αποτελέσματα δεν έχουν υποβληθεί προς έγκριση',
      });
    }
    const results = await this.prisma.examResult.findMany({
      where: { tenantId: this.ctx.tenantId, examId },
    });
    if (!results.length) throw new BadRequestException('Δεν υπάρχουν αποτελέσματα');
    if (results.some((result) => result.grade === null || !result.submittedAt)) {
      throw new BadRequestException('Υπάρχουν μη υποβληθέντα ή χωρίς βαθμό αποτελέσματα');
    }
    await this.prisma.examResult.updateMany({
      where: { tenantId: this.ctx.tenantId, examId },
      data: { approvedAt: new Date(), approvedById: this.ctx.userId },
    });
    await this.audit.record('exam.results_approved', 'Exam', examId, {
      results: results.length,
    });
    return this.resultRoster(examId);
  }

  async publish(examId: string) {
    const exam = await this.requireExam(examId);
    if (exam.status !== 'PENDING_APPROVAL') {
      throw new ConflictException({
        code: 'EXAM_NOT_APPROVED',
        message: 'Η εξέταση δεν είναι έτοιμη για δημοσίευση',
      });
    }
    const results = await this.prisma.examResult.findMany({
      where: { tenantId: this.ctx.tenantId, examId },
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            userId: true,
            guardians: {
              select: {
                guardian: {
                  select: {
                    userId: true,
                    email: true,
                    user: { select: { email: true } },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!results.length) throw new BadRequestException('Δεν υπάρχουν αποτελέσματα');
    if (results.some((result) => !result.approvedAt)) {
      throw new BadRequestException('Υπάρχουν αποτελέσματα χωρίς έγκριση');
    }

    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.exam.update({
        where: { id: examId },
        data: { status: 'PUBLISHED', publishedAt: now, publishedById: this.ctx.userId },
      }),
      this.prisma.examResult.updateMany({
        where: { tenantId: this.ctx.tenantId, examId },
        data: { publishedAt: now },
      }),
    ]);

    for (const result of results) {
      const gradeLabel = result.grade === null ? '—' : String(Number(result.grade));
      const recipientIds = [
        result.student.userId,
        ...result.student.guardians.map((link) => link.guardian.userId),
      ].filter((value): value is string => Boolean(value));
      await this.notifications.createForUsers(recipientIds, {
        type: 'EXAM_RESULT_READY',
        title: `Αποτελέσματα: ${exam.title}`,
        body: `Ο βαθμός του/της ${result.student.firstName} ${result.student.lastName} είναι ${gradeLabel} (${result.outcome}).`,
        entityType: 'Exam',
        entityId: examId,
      });
      const emails = [
        result.student.email,
        ...result.student.guardians.flatMap((link) => [
          link.guardian.email,
          link.guardian.user?.email,
        ]),
      ].filter((value): value is string => Boolean(value));
      for (const email of [...new Set(emails)]) {
        await this.outbox.enqueue({
          type: 'email',
          dedupeKey: `exam-result:${examId}:${result.studentId}:${email}`,
          payload: {
            to: email,
            subject: `Αποτελέσματα εξέτασης: ${exam.title}`,
            text: `Ο βαθμός του/της ${result.student.firstName} ${result.student.lastName} είναι ${gradeLabel} (${result.outcome}).`,
          },
        });
      }
    }

    await this.audit.record('exam.published', 'Exam', examId, { results: results.length });
    try {
      await this.documents.ensureExamRecord(examId);
    } catch (error) {
      this.logger.warn(`Exam minutes generation failed for ${examId}: ${String(error)}`);
    }
    return this.get(examId);
  }

  async minutes(examId: string) {
    await this.requireExam(examId);
    return this.documents.ensureExamRecord(examId);
  }

  async studentResults(studentId: string) {
    await this.scope.assertStudentAccessible(studentId);
    const results = await this.prisma.examResult.findMany({
      where: { tenantId: this.ctx.tenantId, studentId },
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
    if (!results.length) {
      const student = await this.prisma.student.findFirst({
        where: { id: studentId, tenantId: this.ctx.tenantId },
        select: { id: true },
      });
      if (!student) throw new NotFoundException('Ο μαθητής δεν βρέθηκε');
    }
    return { data: results };
  }

  private async requireExam(id: string) {
    const exam = await this.prisma.exam.findFirst({
      where: { id, tenantId: this.ctx.tenantId },
    });
    if (!exam) throw new NotFoundException('Η εξέταση δεν βρέθηκε');
    return exam;
  }

  private async validateReferences(
    programId: string,
    levelId?: string | null,
    periodId?: string | null,
  ) {
    const tenantId = this.ctx.tenantId;
    const [program, level, period] = await Promise.all([
      this.prisma.program.findFirst({ where: { id: programId, tenantId }, select: { id: true } }),
      levelId
        ? this.prisma.level.findFirst({ where: { id: levelId, tenantId }, select: { id: true } })
        : Promise.resolve(null),
      periodId
        ? this.prisma.examPeriod.findFirst({
            where: { id: periodId, tenantId },
            select: { id: true },
          })
        : Promise.resolve(null),
    ]);
    if (!program) throw new NotFoundException('Το πρόγραμμα δεν βρέθηκε');
    if (levelId && !level) throw new NotFoundException('Το επίπεδο δεν βρέθηκε');
    if (periodId && !period) throw new NotFoundException('Η εξεταστική περίοδος δεν βρέθηκε');
  }

  private async eligibleStudents(exam: {
    programId: string;
    levelId: string | null;
  }) {
    const enrollments = await this.prisma.enrollment.findMany({
      where: {
        tenantId: this.ctx.tenantId,
        status: 'ACTIVE',
        programId: exam.programId,
        ...(exam.levelId ? { levelId: exam.levelId } : {}),
      },
      include: {
        student: {
          select: { id: true, firstName: true, lastName: true, registrationNumber: true },
        },
      },
    });
    const byId = new Map(enrollments.map((enrollment) => [enrollment.studentId, enrollment.student]));
    return [...byId.values()];
  }

  private async assertEligible(
    exam: { id: string; programId: string; levelId: string | null },
    studentId: string,
  ) {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, tenantId: this.ctx.tenantId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!student) throw new NotFoundException('Ο μαθητής δεν βρέθηκε');
    const enrollment = await this.prisma.enrollment.findFirst({
      where: {
        tenantId: this.ctx.tenantId,
        studentId,
        status: 'ACTIVE',
        programId: exam.programId,
        ...(exam.levelId ? { levelId: exam.levelId } : {}),
      },
      select: { id: true },
    });
    if (!enrollment) {
      throw new BadRequestException({
        code: 'EXAM_NOT_ELIGIBLE',
        message: 'Ο μαθητής δεν έχει ενεργή εγγραφή στο πρόγραμμα της εξέτασης',
      });
    }
  }

  private async teacherAccess(examId: string): Promise<{
    teacherId: string | null;
    committee: boolean;
  }> {
    if (!this.scope.isTeacher) return { teacherId: null, committee: false };
    const teacherId = await this.scope.requireTeacherId();
    const member = await this.prisma.examCommitteeMember.findFirst({
      where: { tenantId: this.ctx.tenantId, examId, teacherId },
      select: { id: true },
    });
    return { teacherId, committee: Boolean(member) };
  }

  private async assignedStudentIds(teacherId: string): Promise<Set<string>> {
    const tenantId = this.ctx.tenantId;
    const [enrollments, series] = await Promise.all([
      this.prisma.enrollment.findMany({
        where: { tenantId, teacherId, status: 'ACTIVE' },
        select: { studentId: true },
      }),
      this.prisma.lessonSeriesStudent.findMany({
        where: { tenantId, lessonSeries: { teacherId } },
        select: { studentId: true },
      }),
    ]);
    return new Set([
      ...enrollments.map((enrollment) => enrollment.studentId),
      ...series.map((row) => row.studentId),
    ]);
  }
}

function isClosed(status: string): boolean {
  return (CLOSED_STATUSES as readonly string[]).includes(status);
}

function dateOnly(value: string): Date {
  return new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
