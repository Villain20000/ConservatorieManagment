import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../../common/audit.service.js';
import { NotificationsService } from '../../common/notifications.service.js';
import { ScopeService } from '../../common/scope.service.js';
import { TenantContextService } from '../../common/tenant-context.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import type {
  AssignmentQueryDto,
  CreateAssignmentDto,
  GradeSubmissionDto,
  SubmitAssignmentDto,
  UpdateAssignmentDto,
} from './dto/assignments.dto.js';

const SUBMISSION_INCLUDE = {
  student: {
    select: { id: true, firstName: true, lastName: true, registrationNumber: true },
  },
  gradedBy: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.AssignmentSubmissionInclude;

@Injectable()
export class AssignmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: TenantContextService,
    private readonly scope: ScopeService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) { }

  // ── Staff: assignment management ─────────────────────────────────────────

  async list(query: AssignmentQueryDto) {
    const where: Prisma.AssignmentWhereInput = { tenantId: this.ctx.tenantId };
    if (query.status) where.status = query.status;
    if (query.programId) where.programId = query.programId;
    if (query.from || query.to) {
      where.assignedOn = {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lte: new Date(query.to) } : {}),
      };
    }
    // Teachers see only their own assignments; administrators/directors see all.
    if (this.scope.isTeacher) {
      const teacherId = await this.scope.requireTeacherId();
      where.teacherId = teacherId;
    }

    const assignments = await this.prisma.assignment.findMany({
      where,
      include: {
        program: { select: { id: true, name: true, color: true } },
        teacher: { select: { id: true, firstName: true, lastName: true } },
        _count: { select: { targets: true, submissions: true } },
        submissions: { where: { status: 'GRADED' }, select: { id: true } },
      },
      orderBy: { assignedOn: 'desc' },
      take: 200,
    });

    return {
      data: assignments.map((assignment) => ({
        ...assignment,
        submissions: undefined,
        gradedCount: assignment._count.submissions,
        targetCount: assignment._count.targets,
      })),
    };
  }

  async get(id: string) {
    const assignment = await this.prisma.assignment.findFirst({
      where: { id, tenantId: this.ctx.tenantId },
      include: {
        program: { select: { id: true, name: true, color: true } },
        lessonSeries: { select: { id: true, title: true } },
        teacher: { select: { id: true, firstName: true, lastName: true } },
        targets: {
          include: {
            student: {
              select: { id: true, firstName: true, lastName: true, registrationNumber: true },
            },
          },
          orderBy: { studentId: 'asc' },
        },
        submissions: { include: SUBMISSION_INCLUDE },
      },
    });
    if (!assignment) throw new NotFoundException('Η εργασία δεν βρέθηκε');
    if (this.scope.isTeacher) {
      const teacherId = await this.scope.requireTeacherId();
      if (assignment.teacherId !== teacherId) {
        throw new NotFoundException('Η εργασία δεν βρέθηκε');
      }
    }
    return { ...assignment, submissions: undefined, targets: assignment.targets };
  }

  async create(dto: CreateAssignmentDto) {
    if (this.scope.isTeacher) {
      const teacherId = await this.scope.requireTeacherId();
      // Teachers may only target students actually taught by them.
      const taught = await this.assertStudentsTaught(teacherId, dto.studentIds);
      if (taught.length !== dto.studentIds.length) {
        throw new ForbiddenException('Μπορείτε να αναθέτετε εργασίες μόνο στους μαθητές σας');
      }
    }
    if (dto.dueAt) {
      const due = new Date(dto.dueAt);
      if (Number.isNaN(due.getTime())) {
        throw new BadRequestException('Μη έγκυρη ημερομηνία παράδοσης');
      }
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const teacherId = this.scope.isTeacher ? await this.scope.requireTeacherId() : null;
      const assignment = await tx.assignment.create({
        data: {
          tenantId: this.ctx.tenantId,
          createdById: this.ctx.userId!,
          teacherId,
          programId: dto.programId ?? null,
          lessonSeriesId: dto.lessonSeriesId ?? null,
          title: dto.title,
          description: dto.description ?? null,
          assignedOn: new Date(`${dto.assignedOn.slice(0, 10)}T00:00:00.000Z`),
          dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
        },
      });
      await tx.assignmentTarget.createMany({
        data: dto.studentIds.map((studentId) => ({
          tenantId: this.ctx.tenantId,
          assignmentId: assignment.id,
          studentId,
        })),
        skipDuplicates: true,
      });
      return assignment;
    });

    await this.audit.record('assignment.created', 'Assignment', created.id, {
      title: created.title,
      studentCount: dto.studentIds.length,
    });
    await this.notifyTargets(created.id, {
      type: 'ASSIGNMENT_CREATED',
      title: 'Νέα εργασία',
      body: `«${created.title}» — ελέγξτε τις εργασίες σας στο χάρτη μελέτης.`,
    });
    return this.get(created.id);
  }

  async update(id: string, dto: UpdateAssignmentDto) {
    const assignment = await this.getOwned(id);
    if (dto.status === 'CANCELLED' && assignment.status === 'CANCELLED') {
      throw new BadRequestException('Η εργασία έχει ήδη ακυρωθεί');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.assignment.update({
        where: { id: assignment.id },
        data: {
          ...(dto.title !== undefined ? { title: dto.title } : {}),
          ...(dto.description !== undefined ? { description: dto.description } : {}),
          ...(dto.dueAt !== undefined ? { dueAt: dto.dueAt ? new Date(dto.dueAt) : null } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
        },
      });
      if (dto.studentIds) {
        // Replace targets; keep submissions for students that stay.
        await tx.assignmentTarget.deleteMany({
          where: { tenantId: this.ctx.tenantId, assignmentId: assignment.id },
        });
        await tx.assignmentTarget.createMany({
          data: dto.studentIds.map((studentId) => ({
            tenantId: this.ctx.tenantId,
            assignmentId: assignment.id,
            studentId,
          })),
          skipDuplicates: true,
        });
        // Submissions of students no longer targeted are removed together with
        // their target so the "one submission per targeted student" invariant
        // stays queryable from the target set alone.
        await tx.assignmentSubmission.deleteMany({
          where: {
            tenantId: this.ctx.tenantId,
            assignmentId: assignment.id,
            studentId: { notIn: dto.studentIds },
          },
        });
      }
    });

    await this.audit.record('assignment.updated', 'Assignment', assignment.id, {
      title: dto.title ?? assignment.title,
      status: dto.status ?? assignment.status,
    });
    return this.get(assignment.id);
  }

  // ── Student: submit ──────────────────────────────────────────────────────

  async submit(assignmentId: string, dto: SubmitAssignmentDto) {
    const studentId = await this.scope.requireStudentId();
    const assignment = await this.prisma.assignment.findFirst({
      where: { id: assignmentId, tenantId: this.ctx.tenantId },
      select: { id: true, title: true, status: true, dueAt: true },
    });
    if (!assignment) throw new NotFoundException('Η εργασία δεν βρέθηκε');
    if (assignment.status !== 'ACTIVE') {
      throw new BadRequestException('Η εργασία δεν δέχεται παραδόσεις');
    }
    const targeted = await this.prisma.assignmentTarget.findFirst({
      where: { tenantId: this.ctx.tenantId, assignmentId, studentId },
      select: { id: true },
    });
    if (!targeted) throw new NotFoundException('Η εργασία δεν βρέθηκε');

    const existing = await this.prisma.assignmentSubmission.findFirst({
      where: { tenantId: this.ctx.tenantId, assignmentId, studentId },
      select: { id: true, status: true },
    });
    if (existing && existing.status === 'GRADED') {
      throw new BadRequestException('Η εργασία έχει ήδη βαθμολογηθεί');
    }

    const submission = existing
      ? await this.prisma.assignmentSubmission.update({
        where: { id: existing.id },
        data: { content: dto.content, submittedAt: new Date(), status: 'SUBMITTED' },
      })
      : await this.prisma.assignmentSubmission.create({
        data: {
          tenantId: this.ctx.tenantId,
          assignmentId,
          studentId,
          content: dto.content,
          submittedAt: new Date(),
          status: 'SUBMITTED',
        },
      });

    await this.audit.record('assignment.submitted', 'AssignmentSubmission', submission.id, {
      assignmentId,
      studentId,
      resubmission: Boolean(existing),
    });
    await this.notifyAssignmentTeacher(assignmentId, {
      type: 'ASSIGNMENT_SUBMITTED',
      title: 'Νέα παράδοση',
      body: `Υποβλήθηκε παράδοση για «${assignment.title}».`,
      entityId: submission.id,
    });
    return submission;
  }

  // ── Teacher: grade ───────────────────────────────────────────────────────

  async grade(assignmentId: string, submissionId: string, dto: GradeSubmissionDto) {
    const teacherId = await this.scope.requireTeacherId();
    const submission = await this.prisma.assignmentSubmission.findFirst({
      where: { id: submissionId, tenantId: this.ctx.tenantId, assignmentId },
      include: {
        student: { select: { userId: true } },
        assignment: { select: { id: true, teacherId: true, title: true, status: true } },
      },
    });
    if (!submission) throw new NotFoundException('Η παράδοση δεν βρέθηκε');
    if (submission.assignment.teacherId !== teacherId) {
      throw new NotFoundException('Η παράδοση δεν βρέθηκε');
    }
    if (!submission.submittedAt) {
      throw new BadRequestException('Η παράδοση δεν έχει υποβληθεί ακόμη');
    }

    const graded = await this.prisma.assignmentSubmission.update({
      where: { id: submission.id },
      data: {
        status: 'GRADED',
        grade: dto.grade,
        feedback: dto.feedback ?? null,
        gradedById: this.ctx.userId!,
        gradedAt: new Date(),
      },
    });

    await this.audit.record('assignment.graded', 'AssignmentSubmission', submission.id, {
      assignmentId,
      studentId: submission.studentId,
      grade: dto.grade,
    });
    if (submission.student.userId) {
      await this.notifications.createForUsers([submission.student.userId], {
        type: 'ASSIGNMENT_GRADED',
        title: 'Η εργασία βαθμολογήθηκε',
        body: `«${submission.assignment.title}» — βαθμός ${dto.grade}/100.`,
        entityType: 'Assignment',
        entityId: assignmentId,
      });
    }
    return graded;
  }

  async listSubmissions(assignmentId: string) {
    await this.getOwned(assignmentId);
    const submissions = await this.prisma.assignmentSubmission.findMany({
      where: { tenantId: this.ctx.tenantId, assignmentId },
      include: SUBMISSION_INCLUDE,
      orderBy: { submittedAt: 'desc' },
    });
    return { data: submissions };
  }

  // ── Student/guardian portal ──────────────────────────────────────────────

  /** Assignments for one student (portal). Guardians are scoped by
   * `assertStudentAccessible`; students can only ever see their own. */
  async portalList(studentId?: string, status?: string) {
    const resolved = await this.resolveStudentId(studentId);
    const where: Prisma.AssignmentWhereInput = {
      tenantId: this.ctx.tenantId,
      status: 'ACTIVE',
      targets: { some: { studentId: resolved } },
    };
    if (status) {
      where.submissions = { some: { studentId: resolved, status: status as 'SUBMITTED' } };
    }
    const assignments = await this.prisma.assignment.findMany({
      where,
      include: {
        program: { select: { id: true, name: true, color: true } },
        teacher: { select: { id: true, firstName: true, lastName: true } },
        submissions: {
          where: { studentId: resolved },
          select: {
            id: true,
            status: true,
            content: true,
            submittedAt: true,
            grade: true,
            feedback: true,
            gradedAt: true,
          },
        },
      },
      orderBy: [{ dueAt: 'asc' }, { assignedOn: 'desc' }],
      take: 100,
    });
    return {
      data: assignments.map((assignment) => ({
        id: assignment.id,
        title: assignment.title,
        description: assignment.description,
        assignedOn: assignment.assignedOn,
        dueAt: assignment.dueAt,
        program: assignment.program,
        teacher: assignment.teacher,
        submission: assignment.submissions[0] ?? null,
      })),
    };
  }

  // ── Internals ────────────────────────────────────────────────────────────

  /** Loads the assignment and enforces teacher ownership; administrators pass
   * through. Foreign-tenant ids read as 404 so tenants cannot be probed. */
  private async getOwned(id: string) {
    const assignment = await this.prisma.assignment.findFirst({
      where: { id, tenantId: this.ctx.tenantId },
      select: { id: true, title: true, status: true, teacherId: true },
    });
    if (!assignment) throw new NotFoundException('Η εργασία δεν βρέθηκε');
    if (this.scope.isTeacher) {
      const teacherId = await this.scope.requireTeacherId();
      if (assignment.teacherId !== teacherId) {
        throw new NotFoundException('Η εργασία δεν βρέθηκε');
      }
    }
    return assignment;
  }

  /** Students the teacher actually teaches: direct enrollment or a shared
   * lesson series. Returns the subset that is linked. */
  private async assertStudentsTaught(teacherId: string, studentIds: string[]) {
    const rows = await this.prisma.student.findMany({
      where: {
        tenantId: this.ctx.tenantId,
        id: { in: studentIds },
        OR: [
          { enrollments: { some: { tenantId: this.ctx.tenantId, teacherId } } },
          { lessonSeries: { some: { tenantId: this.ctx.tenantId, lessonSeries: { teacherId } } } },
        ],
      },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  private async notifyTargets(
    assignmentId: string,
    input: { type: 'ASSIGNMENT_CREATED'; title: string; body: string },
  ): Promise<void> {
    const targets = await this.prisma.assignmentTarget.findMany({
      where: { tenantId: this.ctx.tenantId, assignmentId },
      include: { student: { select: { userId: true } } },
    });
    const userIds = targets.map((t) => t.student.userId).filter((id): id is string => Boolean(id));
    await this.notifications.createForUsers(userIds, {
      type: input.type,
      title: input.title,
      body: input.body,
      entityType: 'Assignment',
      entityId: assignmentId,
    });
  }

  private async notifyAssignmentTeacher(
    assignmentId: string,
    input: {
      type: 'ASSIGNMENT_SUBMITTED';
      title: string;
      body: string;
      entityId: string;
    },
  ): Promise<void> {
    const assignment = await this.prisma.assignment.findFirst({
      where: { id: assignmentId, tenantId: this.ctx.tenantId },
      include: { teacher: { select: { userId: true } } },
    });
    if (!assignment?.teacher?.userId) return;
    await this.notifications.createForUsers([assignment.teacher.userId], {
      type: input.type,
      title: input.title,
      body: input.body,
      entityType: 'AssignmentSubmission',
      entityId: input.entityId,
    });
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
        message: 'Επιλέξτε παιδί για να δείτε τις εργασίες',
      });
    }
    return this.scope.requireStudentId();
  }
}
