// oxlint-disable typescript/no-misused-spread -- DTOs are validated data classes; spreading them into Prisma writes is intentional.
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../../common/audit.service.js';
import { pageMeta } from '../../common/dto/pagination.dto.js';
import { EntitlementsService } from '../../common/entitlements.service.js';
import { ScopeService } from '../../common/scope.service.js';
import { SoftDeleteService } from '../../common/soft-delete.service.js';
import { TenantContextService } from '../../common/tenant-context.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import type {
  AddGuardianDto,
  CreateStudentDto,
  CreateTeacherDto,
  EnrollmentInputDto,
  EnrollmentQueryDto,
  GuardianQueryDto,
  StudentQueryDto,
  StudentStatusDto,
  TeacherQueryDto,
  UpdateEnrollmentDto,
  UpdateStudentDto,
  UpdateTeacherDto,
} from './dto/people.dto.js';

const studentListInclude = {
  branch: { select: { id: true, name: true, code: true } },
  enrollments: {
    where: { status: 'ACTIVE' as const },
    orderBy: { enrolledAt: 'desc' as const },
    take: 1,
    include: {
      program: { select: { id: true, name: true, color: true } },
      level: { select: { id: true, name: true } },
      teacher: { select: { id: true, firstName: true, lastName: true } },
      academicYear: { select: { id: true, name: true } },
    },
  },
  _count: { select: { guardians: true, attendances: true } },
};

@Injectable()
export class PeopleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: TenantContextService,
    private readonly scope: ScopeService,
    private readonly audit: AuditService,
    private readonly entitlements: EntitlementsService,
    private readonly softDelete: SoftDeleteService,
  ) {}

  async listStudents(query: StudentQueryDto) {
    const tenantId = this.ctx.tenantId;
    const where: Prisma.StudentWhereInput = { tenantId };
    const and: Prisma.StudentWhereInput[] = [];

    if (query.status) where.status = query.status;
    if (query.branchId) where.branchId = query.branchId;
    if (query.programId) {
      and.push({ enrollments: { some: { programId: query.programId, status: 'ACTIVE' } } });
    }
    if (query.teacherId) {
      and.push({ enrollments: { some: { teacherId: query.teacherId, status: 'ACTIVE' } } });
    }
    if (this.scope.isTeacher) {
      const teacherId = await this.scope.requireTeacherId();
      and.push({
        OR: [
          { enrollments: { some: { teacherId, status: 'ACTIVE' } } },
          { lessonSeries: { some: { lessonSeries: { teacherId } } } },
        ],
      });
    }
    if (this.scope.isGuardian) {
      and.push({ id: { in: await this.scope.guardianChildIds() } });
    }
    if (query.search) {
      const search = query.search.trim();
      and.push({
        OR: [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { registrationNumber: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
        ],
      });
    }
    if (and.length) where.AND = and;

    const [total, data] = await Promise.all([
      this.prisma.student.count({ where }),
      this.prisma.student.findMany({
        where,
        include: studentListInclude,
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        skip: query.skip,
        take: query.pageSize,
      }),
    ]);

    return { data, meta: pageMeta(total, query.page, query.pageSize) };
  }

  async getStudent(id: string) {
    await this.scope.assertStudentAccessible(id);
    const tenantId = this.ctx.tenantId;
    const student = await this.prisma.student.findFirst({
      where: { id, tenantId },
      include: {
        branch: true,
        user: { select: { id: true, email: true, lastLoginAt: true } },
        guardians: {
          include: { guardian: true },
          orderBy: { isPrimary: 'desc' },
        },
        enrollments: {
          include: {
            program: true,
            level: true,
            academicYear: true,
            branch: true,
            teacher: { select: { id: true, firstName: true, lastName: true } },
          },
          orderBy: { enrolledAt: 'desc' },
        },
        attendances: {
          include: {
            lesson: {
              select: { id: true, title: true, startsAt: true, status: true },
            },
          },
          orderBy: { lesson: { startsAt: 'desc' } },
          take: 12,
        },
        _count: {
          select: { charges: true, documents: true, examResults: true, lessons: true },
        },
      },
    });
    if (!student) throw new NotFoundException('Ο μαθητής δεν βρέθηκε');

    const attendanceGroups = await this.prisma.attendance.groupBy({
      by: ['status'],
      where: { tenantId, studentId: id },
      _count: { _all: true },
    });
    const attendanceSummary = {
      PRESENT: 0,
      ABSENT: 0,
      LATE: 0,
      EXCUSED: 0,
      total: 0,
    };
    for (const group of attendanceGroups) {
      attendanceSummary[group.status] = group._count._all;
      attendanceSummary.total += group._count._all;
    }
    const rate =
      attendanceSummary.total === 0
        ? null
        : Math.round(
            ((attendanceSummary.PRESENT + attendanceSummary.LATE) / attendanceSummary.total) * 100,
          );

    return {
      ...student,
      attendanceSummary: { ...attendanceSummary, rate },
      financeSummary: await this.studentFinanceSummary(id),
    };
  }

  async createStudent(dto: CreateStudentDto) {
    const tenantId = this.ctx.tenantId;
    await this.requireBranch(dto.branchId);
    if (dto.enrollment) await this.validateEnrollmentRefs(dto.enrollment, dto.branchId);

    const registrationNumber =
      dto.registrationNumber?.trim() || (await this.nextRegistrationNumber());

    try {
      const student = await this.prisma.$transaction(async (tx) => {
        // Seat limit is checked inside the transaction, under a tenant row lock,
        // so two concurrent creates cannot both slip past the last seat.
        await this.entitlements.assertCanAddStudent(tx, tenantId);

        const created = await tx.student.create({
          data: {
            tenantId,
            branchId: dto.branchId,
            firstName: dto.firstName.trim(),
            lastName: dto.lastName.trim(),
            registrationNumber,
            birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
            gender: dto.gender,
            email: dto.email?.toLowerCase(),
            phone: dto.phone,
            address: dto.address,
            city: dto.city,
            notes: dto.notes,
            status: dto.status,
            enrolledAt: dto.enrolledAt ? new Date(dto.enrolledAt) : undefined,
            consentData: dto.consentData ?? false,
            consentMedia: dto.consentMedia ?? false,
          },
        });

        for (const guardianInput of dto.guardians ?? []) {
          const guardianId = await this.ensureGuardian(tx, guardianInput);
          await tx.studentGuardian.create({
            data: {
              tenantId,
              studentId: created.id,
              guardianId,
              relationship: guardianInput.relationship ?? 'Γονέας',
              isPrimary: guardianInput.isPrimary ?? false,
            },
          });
        }

        if (dto.enrollment) {
          await this.createEnrollmentRecord(tx, created.id, created.branchId, dto.enrollment);
        }

        return created;
      });

      await this.audit.record('student.created', 'Student', student.id, {
        registrationNumber,
      });
      return this.getStudent(student.id);
    } catch (error) {
      this.handleConflict(error, 'Υπάρχει ήδη μαθητής με αυτόν τον αριθμό μητρώου');
    }
  }

  async updateStudent(id: string, dto: UpdateStudentDto) {
    await this.requireStudent(id);
    if (dto.branchId) await this.requireBranch(dto.branchId);

    const { birthDate, enrolledAt, ...rest } = dto;
    try {
      const student = await this.prisma.student.update({
        where: { id },
        data: {
          ...rest,
          ...(birthDate !== undefined
            ? { birthDate: birthDate ? new Date(birthDate) : null }
            : {}),
          ...(enrolledAt ? { enrolledAt: new Date(enrolledAt) } : {}),
        },
      });
      await this.audit.record('student.updated', 'Student', id, { fields: Object.keys(dto) });
      return student;
    } catch (error) {
      this.handleConflict(error, 'Υπάρχει ήδη μαθητής με αυτόν τον αριθμό μητρώου');
    }
  }

  async setStudentStatus(id: string, dto: StudentStatusDto) {
    await this.requireStudent(id);
    const student = await this.prisma.student.update({
      where: { id },
      data: { status: dto.status, ...(dto.reason ? { notes: dto.reason } : {}) },
    });
    await this.audit.record('student.status.changed', 'Student', id, {
      status: dto.status,
    });
    return student;
  }

  async addGuardian(studentId: string, dto: AddGuardianDto) {
    await this.requireStudent(studentId);
    const tenantId = this.ctx.tenantId;

    if (dto.guardianId) {
      const guardian = await this.prisma.guardian.findFirst({
        where: { id: dto.guardianId, tenantId },
      });
      if (!guardian) throw new NotFoundException('Ο κηδεμόνας δεν βρέθηκε');
      const existing = await this.prisma.studentGuardian.findUnique({
        where: {
          studentId_guardianId: { studentId, guardianId: dto.guardianId },
        },
      });
      if (existing) throw new ConflictException('Ο κηδεμόνας έχει ήδη συνδεθεί με τον μαθητή');
      await this.prisma.studentGuardian.create({
        data: {
          tenantId,
          studentId,
          guardianId: dto.guardianId,
          relationship: dto.relationship ?? 'Γονέας',
          isPrimary: dto.isPrimary ?? false,
        },
      });
    } else {
      if (!dto.firstName || !dto.lastName) {
        throw new BadRequestException('Απαιτούνται όνομα και επώνυμο κηδεμόνα');
      }
      await this.prisma.$transaction(async (tx) => {
        const guardianId = await this.ensureGuardian(tx, dto);
        await tx.studentGuardian.create({
          data: {
            tenantId,
            studentId,
            guardianId,
            relationship: dto.relationship ?? 'Γονέας',
            isPrimary: dto.isPrimary ?? false,
          },
        });
      });
    }

    await this.audit.record('student.guardian.added', 'Student', studentId);
    return this.getStudent(studentId);
  }

  async removeGuardian(studentId: string, studentGuardianId: string) {
    await this.requireStudent(studentId);
    const relation = await this.prisma.studentGuardian.findFirst({
      where: { id: studentGuardianId, studentId, tenantId: this.ctx.tenantId },
    });
    if (!relation) throw new NotFoundException('Η σχέση κηδεμόνα δεν βρέθηκε');
    await this.prisma.studentGuardian.delete({ where: { id: studentGuardianId } });
    await this.audit.record('student.guardian.removed', 'Student', studentId);
    return { success: true };
  }

  async addEnrollment(studentId: string, dto: EnrollmentInputDto) {
    const student = await this.requireStudent(studentId);
    await this.validateEnrollmentRefs(dto, student.branchId);
    const enrollment = await this.prisma.$transaction((tx) =>
      this.createEnrollmentRecord(tx, studentId, student.branchId, dto),
    );
    await this.audit.record('enrollment.created', 'Enrollment', enrollment.id, {
      studentId,
    });
    return enrollment;
  }

  async updateEnrollment(id: string, dto: UpdateEnrollmentDto) {
    const enrollment = await this.prisma.enrollment.findFirst({
      where: { id, tenantId: this.ctx.tenantId },
    });
    if (!enrollment) throw new NotFoundException('Η εγγραφή δεν βρέθηκε');
    await this.validateEnrollmentRefs(
      {
        programId: dto.programId ?? enrollment.programId,
        levelId: dto.levelId ?? enrollment.levelId,
        academicYearId: dto.academicYearId ?? enrollment.academicYearId,
        branchId: dto.branchId ?? enrollment.branchId,
        teacherId: dto.teacherId ?? undefined,
      },
      enrollment.branchId,
    );

    const { endedAt, ...rest } = dto;
    const updated = await this.prisma.enrollment.update({
      where: { id },
      data: {
        ...rest,
        ...(endedAt !== undefined ? { endedAt: endedAt ? new Date(endedAt) : null } : {}),
      },
    });
    await this.audit.record('enrollment.updated', 'Enrollment', id, {
      fields: Object.keys(dto),
    });
    return updated;
  }

  async listEnrollments(query: EnrollmentQueryDto) {
    const where: Prisma.EnrollmentWhereInput = { tenantId: this.ctx.tenantId };
    if (query.studentId) where.studentId = query.studentId;
    if (query.programId) where.programId = query.programId;
    if (query.status) where.status = query.status;
    if (this.scope.isTeacher) {
      where.teacherId = await this.scope.requireTeacherId();
    }
    if (this.scope.isGuardian) {
      if (query.studentId) {
        await this.scope.assertStudentAccessible(query.studentId);
      } else {
        where.studentId = { in: await this.scope.guardianChildIds() };
      }
    }
    if (query.search) {
      where.student = {
        OR: [
          { firstName: { contains: query.search, mode: 'insensitive' } },
          { lastName: { contains: query.search, mode: 'insensitive' } },
        ],
      };
    }
    const [total, data] = await Promise.all([
      this.prisma.enrollment.count({ where }),
      this.prisma.enrollment.findMany({
        where,
        include: {
          student: {
            select: { id: true, firstName: true, lastName: true, registrationNumber: true },
          },
          program: true,
          level: true,
          academicYear: true,
          branch: true,
          teacher: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { enrolledAt: 'desc' },
        skip: query.skip,
        take: query.pageSize,
      }),
    ]);
    return { data, meta: pageMeta(total, query.page, query.pageSize) };
  }

  async listGuardians(query: GuardianQueryDto) {
    const where: Prisma.GuardianWhereInput = { tenantId: this.ctx.tenantId };
    if (query.search) {
      where.OR = [
        { firstName: { contains: query.search, mode: 'insensitive' } },
        { lastName: { contains: query.search, mode: 'insensitive' } },
        { phone: { contains: query.search } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    const [total, data] = await Promise.all([
      this.prisma.guardian.count({ where }),
      this.prisma.guardian.findMany({
        where,
        include: {
          students: {
            include: {
              student: {
                select: { id: true, firstName: true, lastName: true, registrationNumber: true },
              },
            },
          },
        },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        skip: query.skip,
        take: query.pageSize,
      }),
    ]);
    return { data, meta: pageMeta(total, query.page, query.pageSize) };
  }

  async listTeachers(query: TeacherQueryDto) {
    const where: Prisma.TeacherWhereInput = { tenantId: this.ctx.tenantId };
    if (query.status) where.status = query.status;
    if (query.programId) {
      const program = await this.prisma.program.findFirst({
        where: { id: query.programId, tenantId: this.ctx.tenantId },
      });
      if (program) where.specialties = { has: program.name };
    }
    if (query.search) {
      where.OR = [
        { firstName: { contains: query.search, mode: 'insensitive' } },
        { lastName: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
        { specialties: { has: query.search } },
      ];
    }
    const [total, data] = await Promise.all([
      this.prisma.teacher.count({ where }),
      this.prisma.teacher.findMany({
        where,
        include: {
          _count: { select: { lessonSeries: true, enrollments: true } },
        },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        skip: query.skip,
        take: query.pageSize,
      }),
    ]);
    return { data, meta: pageMeta(total, query.page, query.pageSize) };
  }

  async getTeacher(id: string) {
    const teacher = await this.prisma.teacher.findFirst({
      where: { id, tenantId: this.ctx.tenantId },
      include: {
        lessonSeries: {
          where: { status: 'ACTIVE' },
          include: {
            program: true,
            level: true,
            branch: true,
            room: true,
            _count: { select: { students: true } },
          },
          orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }],
        },
        enrollments: {
          where: { status: 'ACTIVE' },
          include: {
            student: {
              select: { id: true, firstName: true, lastName: true, registrationNumber: true },
            },
            program: true,
            level: true,
          },
          orderBy: { student: { lastName: 'asc' } },
        },
        _count: { select: { lessons: true } },
      },
    });
    if (!teacher) throw new NotFoundException('Ο καθηγητής δεν βρέθηκε');
    return teacher;
  }

  async createTeacher(dto: CreateTeacherDto) {
    const tenantId = this.ctx.tenantId;
    const teacher = await this.prisma.$transaction(async (tx) => {
      await this.entitlements.assertCanAddTeacher(tx, tenantId);
      return tx.teacher.create({ data: { ...dto, tenantId } });
    });
    await this.audit.record('teacher.created', 'Teacher', teacher.id);
    return teacher;
  }

  async removeTeacher(id: string) {
    await this.requireTeacher(id);
    await this.softDelete.assertTeacherDeletable(id);
    await this.prisma.teacher.delete({ where: { id } });
    await this.audit.record('teacher.deleted', 'Teacher', id);
    return { success: true };
  }

  async restoreTeacher(id: string) {
    const teacher = await this.prisma.teacher.findFirst({
      where: { id, tenantId: this.ctx.tenantId, deletedAt: { not: null } },
    });
    if (!teacher) throw new NotFoundException('Ο καθηγητής δεν βρέθηκε');

    const restored = await this.prisma.teacher.update({
      where: { id },
      data: { deletedAt: null, deletedById: null },
    });
    await this.audit.record('teacher.restored', 'Teacher', id);
    return restored;
  }

  async removeStudent(id: string) {
    await this.requireStudent(id);
    await this.softDelete.assertStudentDeletable(id);
    await this.prisma.student.delete({ where: { id } });
    await this.audit.record('student.deleted', 'Student', id);
    return { success: true };
  }

  async restoreStudent(id: string) {
    const student = await this.prisma.student.findFirst({
      where: { id, tenantId: this.ctx.tenantId, deletedAt: { not: null } },
    });
    if (!student) throw new NotFoundException('Ο μαθητής δεν βρέθηκε');

    const restored = await this.prisma.student.update({
      where: { id },
      data: { deletedAt: null, deletedById: null },
    });
    await this.audit.record('student.restored', 'Student', id);
    return restored;
  }

  async updateTeacher(id: string, dto: UpdateTeacherDto) {
    await this.requireTeacher(id);
    const teacher = await this.prisma.teacher.update({ where: { id }, data: dto });
    await this.audit.record('teacher.updated', 'Teacher', id, { fields: Object.keys(dto) });
    return teacher;
  }

  private async studentFinanceSummary(studentId: string) {
    const [charges, payments] = await Promise.all([
      this.prisma.charge.aggregate({
        where: {
          tenantId: this.ctx.tenantId,
          studentId,
          status: { not: 'CANCELLED' },
        },
        _sum: { amountCents: true, paidAmountCents: true },
      }),
      this.prisma.payment.aggregate({
        where: { tenantId: this.ctx.tenantId, studentId, status: 'POSTED' },
        _sum: { amountCents: true },
      }),
    ]);
    const billed = charges._sum.amountCents ?? 0;
    const paid = charges._sum.paidAmountCents ?? 0;
    return {
      outstanding: Math.max(0, billed - paid) / 100,
      totalPaid: (payments._sum.amountCents ?? 0) / 100,
    };
  }

  private async ensureGuardian(
    tx: Prisma.TransactionClient,
    input: AddGuardianDto,
  ): Promise<string> {
    if (input.guardianId) return input.guardianId;
    if (!input.firstName || !input.lastName) {
      throw new BadRequestException('Απαιτούνται όνομα και επώνυμο κηδεμόνα');
    }
    const guardian = await tx.guardian.create({
      data: {
        tenantId: this.ctx.tenantId,
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email?.toLowerCase(),
        phone: input.phone,
        address: input.address,
        taxId: input.taxId,
        occupation: input.occupation,
      },
    });
    return guardian.id;
  }

  private async createEnrollmentRecord(
    tx: Prisma.TransactionClient,
    studentId: string,
    fallbackBranchId: string,
    input: EnrollmentInputDto,
  ) {
    const academicYearId = input.academicYearId ?? (await this.activeYearId());
    if (!academicYearId) {
      throw new BadRequestException('Δεν υπάρχει ενεργό ακαδημαϊκό έτος');
    }
    return tx.enrollment.create({
      data: {
        tenantId: this.ctx.tenantId,
        studentId,
        programId: input.programId,
        levelId: input.levelId,
        academicYearId,
        branchId: input.branchId ?? fallbackBranchId,
        teacherId: input.teacherId,
        status: input.status,
        enrolledAt: input.enrolledAt ? new Date(input.enrolledAt) : undefined,
      },
    });
  }

  private async activeYearId(): Promise<string | null> {
    const year = await this.prisma.academicYear.findFirst({
      where: { tenantId: this.ctx.tenantId, isActive: true },
      select: { id: true },
    });
    return year?.id ?? null;
  }

  private async nextRegistrationNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `STU-${year}-`;
    const last = await this.prisma.student.findFirst({
      where: {
        tenantId: this.ctx.tenantId,
        registrationNumber: { startsWith: prefix },
      },
      orderBy: { registrationNumber: 'desc' },
      select: { registrationNumber: true },
    });
    const lastSequence = last
      ? Number.parseInt(last.registrationNumber.slice(prefix.length), 10)
      : 0;
    return `${prefix}${String(Number.isFinite(lastSequence) ? lastSequence + 1 : 1).padStart(3, '0')}`;
  }

  private async validateEnrollmentRefs(
    input: Partial<EnrollmentInputDto>,
    fallbackBranchId: string,
  ) {
    const tenantId = this.ctx.tenantId;
    const checks: Promise<unknown>[] = [
      this.prisma.program.findFirst({ where: { id: input.programId, tenantId } }),
      this.prisma.level.findFirst({ where: { id: input.levelId, tenantId } }),
      this.prisma.branch.findFirst({
        where: { id: input.branchId ?? fallbackBranchId, tenantId },
      }),
    ];
    if (input.academicYearId) {
      checks.push(
        this.prisma.academicYear.findFirst({
          where: { id: input.academicYearId, tenantId },
        }),
      );
    }
    if (input.teacherId) {
      checks.push(
        this.prisma.teacher.findFirst({ where: { id: input.teacherId, tenantId } }),
      );
    }
    const results = await Promise.all(checks);
    if (results.some((result) => result === null)) {
      throw new BadRequestException('Μία ή περισσότερες επιλογές δεν ανήκουν στο ωδείο');
    }
  }

  private async requireStudent(id: string) {
    const student = await this.prisma.student.findFirst({
      where: { id, tenantId: this.ctx.tenantId },
    });
    if (!student) throw new NotFoundException('Ο μαθητής δεν βρέθηκε');
    return student;
  }

  private async requireTeacher(id: string) {
    const teacher = await this.prisma.teacher.findFirst({
      where: { id, tenantId: this.ctx.tenantId },
    });
    if (!teacher) throw new NotFoundException('Ο καθηγητής δεν βρέθηκε');
    return teacher;
  }

  private async requireBranch(id: string) {
    const branch = await this.prisma.branch.findFirst({
      where: { id, tenantId: this.ctx.tenantId },
    });
    if (!branch) throw new NotFoundException('Το παράρτημα δεν βρέθηκε');
    return branch;
  }

  private handleConflict(error: unknown, message: string): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException(message);
    }
    throw error;
  }
}
