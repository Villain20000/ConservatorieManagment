import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { TenantContextService } from './tenant-context.service.js';

@Injectable()
export class ScopeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: TenantContextService,
  ) {}

  get isAdministrator(): boolean {
    return this.ctx.isRole('DIRECTOR', 'ADMINISTRATOR');
  }

  get isTeacher(): boolean {
    return this.ctx.isRole('TEACHER');
  }

  get isStudent(): boolean {
    return this.ctx.isRole('STUDENT');
  }

  get isGuardian(): boolean {
    return this.ctx.isRole('GUARDIAN');
  }

  async guardianIdOrNull(): Promise<string | null> {
    if (!this.isGuardian) return null;
    const guardian = await this.prisma.guardian.findFirst({
      where: { tenantId: this.ctx.tenantId, userId: this.ctx.userId },
      select: { id: true },
    });
    return guardian?.id ?? null;
  }

  async requireGuardianId(): Promise<string> {
    const guardianId = await this.guardianIdOrNull();
    if (!guardianId) {
      throw new NotFoundException('Ο λογαριασμός δεν συνδέεται με κηδεμόνα');
    }
    return guardianId;
  }

  async guardianChildIds(): Promise<string[]> {
    const guardianId = await this.requireGuardianId();
    const links = await this.prisma.studentGuardian.findMany({
      where: { tenantId: this.ctx.tenantId, guardianId },
      select: { studentId: true },
      orderBy: { isPrimary: 'desc' },
    });
    return links.map((link) => link.studentId);
  }

  async teacherIdOrNull(): Promise<string | null> {
    if (!this.isTeacher) return null;
    const teacher = await this.prisma.teacher.findFirst({
      where: { tenantId: this.ctx.tenantId, userId: this.ctx.userId },
      select: { id: true },
    });
    return teacher?.id ?? null;
  }

  async requireTeacherId(): Promise<string> {
    const teacherId = await this.teacherIdOrNull();
    if (!teacherId) {
      throw new ForbiddenException('Ο λογαριασμός δεν συνδέεται με καθηγητή');
    }
    return teacherId;
  }

  async studentIdOrNull(): Promise<string | null> {
    if (!this.isStudent) return null;
    const student = await this.prisma.student.findFirst({
      where: { tenantId: this.ctx.tenantId, userId: this.ctx.userId },
      select: { id: true },
    });
    return student?.id ?? null;
  }

  async requireStudentId(): Promise<string> {
    const studentId = await this.studentIdOrNull();
    if (!studentId) {
      throw new NotFoundException('Δεν βρέθηκε μαθητής για τον λογαριασμό');
    }
    return studentId;
  }

  async assertStudentAccessible(studentId: string): Promise<void> {
    if (this.isAdministrator) return;
    if (this.isGuardian) {
      const linked = await this.prisma.studentGuardian.findFirst({
        where: {
          tenantId: this.ctx.tenantId,
          studentId,
          guardian: { userId: this.ctx.userId },
        },
        select: { id: true },
      });
      if (!linked) throw new NotFoundException('Ο μαθητής δεν βρέθηκε');
      return;
    }
    if (this.isStudent) {
      const ownId = await this.requireStudentId();
      if (ownId !== studentId) throw new NotFoundException('Ο μαθητής δεν βρέθηκε');
      return;
    }
    if (this.isTeacher) {
      const teacherId = await this.requireTeacherId();
      const linked = await this.prisma.enrollment.findFirst({
        where: { tenantId: this.ctx.tenantId, studentId, teacherId },
        select: { id: true },
      });
      if (!linked) {
        const series = await this.prisma.lessonSeriesStudent.findFirst({
          where: {
            tenantId: this.ctx.tenantId,
            studentId,
            lessonSeries: { teacherId },
          },
          select: { id: true },
        });
        if (!series) throw new NotFoundException('Ο μαθητής δεν βρέθηκε');
      }
    }
  }
}
