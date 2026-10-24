// oxlint-disable typescript/no-misused-spread -- DTOs are validated data classes; spreading them into Prisma writes is intentional.
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../common/audit.service.js';
import { TenantContextService } from '../../common/tenant-context.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import type {
  CreateAcademicYearDto,
  CreateLevelDto,
  CreateProgramDto,
  CreateRoomDto,
  UpdateAcademicYearDto,
  UpdateLevelDto,
  UpdateProgramDto,
  UpdateRoomDto,
} from './dto/academics.dto.js';

@Injectable()
export class AcademicsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: TenantContextService,
    private readonly audit: AuditService,
  ) {}

  async options() {
    const tenantId = this.ctx.tenantId;
    const [branches, years, programs, levels, rooms, teachers] = await Promise.all([
      this.prisma.branch.findMany({
        where: { tenantId, isActive: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.academicYear.findMany({
        where: { tenantId },
        orderBy: { startsOn: 'desc' },
      }),
      this.prisma.program.findMany({
        where: { tenantId, isActive: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.level.findMany({
        where: { tenantId, isActive: true },
        orderBy: { sortOrder: 'asc' },
      }),
      this.prisma.room.findMany({
        where: { tenantId, isActive: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.teacher.findMany({
        where: { tenantId, status: 'ACTIVE' },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        select: { id: true, firstName: true, lastName: true, specialties: true },
      }),
    ]);
    return {
      branches,
      years,
      programs,
      levels,
      rooms,
      teachers,
      activeYear: years.find((year) => year.isActive) ?? years[0] ?? null,
    };
  }

  listYears() {
    return this.prisma.academicYear.findMany({
      where: { tenantId: this.ctx.tenantId },
      orderBy: { startsOn: 'desc' },
      include: { _count: { select: { enrollments: true } } },
    });
  }

  async createYear(dto: CreateAcademicYearDto) {
    const { startsOn, endsOn, ...rest } = dto;
    this.assertRange(startsOn, endsOn);
    const year = await this.prisma.$transaction(async (tx) => {
      if (rest.isActive) {
        await tx.academicYear.updateMany({
          where: { tenantId: this.ctx.tenantId, isActive: true },
          data: { isActive: false },
        });
      }
      return tx.academicYear.create({
        data: {
          ...rest,
          startsOn: new Date(startsOn),
          endsOn: new Date(endsOn),
          tenantId: this.ctx.tenantId,
        },
      });
    });
    await this.audit.record('academicYear.created', 'AcademicYear', year.id, {
      name: year.name,
    });
    return year;
  }

  async updateYear(id: string, dto: UpdateAcademicYearDto) {
    const existing = await this.requireYear(id);
    const startsOn = dto.startsOn ?? existing.startsOn.toISOString();
    const endsOn = dto.endsOn ?? existing.endsOn.toISOString();
    this.assertRange(startsOn, endsOn);
    const year = await this.prisma.$transaction(async (tx) => {
      if (dto.isActive) {
        await tx.academicYear.updateMany({
          where: { tenantId: this.ctx.tenantId, isActive: true, NOT: { id } },
          data: { isActive: false },
        });
      }
      return tx.academicYear.update({
        where: { id },
        data: {
          ...dto,
          ...(dto.startsOn ? { startsOn: new Date(dto.startsOn) } : {}),
          ...(dto.endsOn ? { endsOn: new Date(dto.endsOn) } : {}),
        },
      });
    });
    await this.audit.record('academicYear.updated', 'AcademicYear', id, { ...dto });
    return year;
  }

  async removeYear(id: string) {
    await this.requireYear(id);
    try {
      await this.prisma.academicYear.delete({ where: { id } });
      await this.audit.record('academicYear.deleted', 'AcademicYear', id);
      return { success: true };
    } catch (error) {
      this.handleReferenceError(error, 'Το ακαδημαϊκό έτος χρησιμοποιείται και δεν μπορεί να διαγραφεί');
    }
  }

  listPrograms() {
    return this.prisma.program.findMany({
      where: { tenantId: this.ctx.tenantId },
      orderBy: { name: 'asc' },
      include: { _count: { select: { enrollments: true, lessonSeries: true } } },
    });
  }

  async createProgram(dto: CreateProgramDto) {
    const program = await this.prisma.program
      .create({ data: { ...dto, tenantId: this.ctx.tenantId } })
      .catch((error: unknown) => this.uniqueProgram(error));
    await this.audit.record('program.created', 'Program', program.id, { code: program.code });
    return program;
  }

  async updateProgram(id: string, dto: UpdateProgramDto) {
    await this.requireProgram(id);
    const program = await this.prisma.program
      .update({ where: { id }, data: dto })
      .catch((error: unknown) => this.uniqueProgram(error));
    await this.audit.record('program.updated', 'Program', id, { ...dto });
    return program;
  }

  async removeProgram(id: string) {
    await this.requireProgram(id);
    try {
      await this.prisma.program.delete({ where: { id } });
      await this.audit.record('program.deleted', 'Program', id);
      return { success: true };
    } catch (error) {
      this.handleReferenceError(error, 'Το πρόγραμμα χρησιμοποιείται και δεν μπορεί να διαγραφεί');
    }
  }

  listLevels() {
    return this.prisma.level.findMany({
      where: { tenantId: this.ctx.tenantId },
      orderBy: { sortOrder: 'asc' },
      include: { _count: { select: { enrollments: true, lessonSeries: true } } },
    });
  }

  async createLevel(dto: CreateLevelDto) {
    const level = await this.prisma.level
      .create({ data: { ...dto, tenantId: this.ctx.tenantId } })
      .catch((error: unknown) => this.uniqueLevel(error));
    await this.audit.record('level.created', 'Level', level.id, { name: level.name });
    return level;
  }

  async updateLevel(id: string, dto: UpdateLevelDto) {
    await this.requireLevel(id);
    const level = await this.prisma.level
      .update({ where: { id }, data: dto })
      .catch((error: unknown) => this.uniqueLevel(error));
    await this.audit.record('level.updated', 'Level', id, { ...dto });
    return level;
  }

  async removeLevel(id: string) {
    await this.requireLevel(id);
    try {
      await this.prisma.level.delete({ where: { id } });
      await this.audit.record('level.deleted', 'Level', id);
      return { success: true };
    } catch (error) {
      this.handleReferenceError(error, 'Το επίπεδο χρησιμοποιείται και δεν μπορεί να διαγραφεί');
    }
  }

  listRooms() {
    return this.prisma.room.findMany({
      where: { tenantId: this.ctx.tenantId },
      orderBy: [{ branch: { name: 'asc' } }, { name: 'asc' }],
      include: { branch: { select: { id: true, name: true, code: true } } },
    });
  }

  async createRoom(dto: CreateRoomDto) {
    await this.requireBranch(dto.branchId);
    const room = await this.prisma.room
      .create({ data: { ...dto, tenantId: this.ctx.tenantId } })
      .catch((error: unknown) => this.uniqueRoom(error));
    await this.audit.record('room.created', 'Room', room.id, { name: room.name });
    return room;
  }

  async updateRoom(id: string, dto: UpdateRoomDto) {
    await this.requireRoom(id);
    if (dto.branchId) await this.requireBranch(dto.branchId);
    const room = await this.prisma.room
      .update({ where: { id }, data: dto })
      .catch((error: unknown) => this.uniqueRoom(error));
    await this.audit.record('room.updated', 'Room', id, { ...dto });
    return room;
  }

  async removeRoom(id: string) {
    await this.requireRoom(id);
    try {
      await this.prisma.room.delete({ where: { id } });
      await this.audit.record('room.deleted', 'Room', id);
      return { success: true };
    } catch (error) {
      this.handleReferenceError(error, 'Η αίθουσα χρησιμοποιείται και δεν μπορεί να διαγραφεί');
    }
  }

  private assertRange(startsOn: string, endsOn: string) {
    if (new Date(startsOn) >= new Date(endsOn)) {
      throw new ConflictException('Η ημερομηνία λήξης πρέπει να είναι μετά την έναρξη');
    }
  }

  private async requireYear(id: string) {
    const year = await this.prisma.academicYear.findFirst({
      where: { id, tenantId: this.ctx.tenantId },
    });
    if (!year) throw new NotFoundException('Το ακαδημαϊκό έτος δεν βρέθηκε');
    return year;
  }

  private async requireProgram(id: string) {
    const program = await this.prisma.program.findFirst({
      where: { id, tenantId: this.ctx.tenantId },
    });
    if (!program) throw new NotFoundException('Το πρόγραμμα δεν βρέθηκε');
    return program;
  }

  private async requireLevel(id: string) {
    const level = await this.prisma.level.findFirst({
      where: { id, tenantId: this.ctx.tenantId },
    });
    if (!level) throw new NotFoundException('Το επίπεδο δεν βρέθηκε');
    return level;
  }

  private async requireRoom(id: string) {
    const room = await this.prisma.room.findFirst({
      where: { id, tenantId: this.ctx.tenantId },
    });
    if (!room) throw new NotFoundException('Η αίθουσα δεν βρέθηκε');
    return room;
  }

  private async requireBranch(id: string) {
    const branch = await this.prisma.branch.findFirst({
      where: { id, tenantId: this.ctx.tenantId },
      select: { id: true },
    });
    if (!branch) throw new NotFoundException('Το παράρτημα δεν βρέθηκε');
  }

  private uniqueProgram(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException('Υπάρχει ήδη πρόγραμμα με αυτόν τον κωδικό ή όνομα');
    }
    throw error;
  }

  private uniqueLevel(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException('Υπάρχει ήδη επίπεδο με αυτό το όνομα');
    }
    throw error;
  }

  private uniqueRoom(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException('Υπάρχει ήδη αίθουσα με αυτό το όνομα στο παράρτημα');
    }
    throw error;
  }

  private handleReferenceError(error: unknown, message: string): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
      throw new ConflictException(message);
    }
    throw error;
  }
}
