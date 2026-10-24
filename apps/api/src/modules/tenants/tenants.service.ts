// oxlint-disable typescript/no-misused-spread -- DTOs are validated data classes; spreading them into Prisma writes is intentional.
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { AuditService } from '../../common/audit.service.js';
import { TenantContextService } from '../../common/tenant-context.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { CreateBranchDto, UpdateBranchDto, UpdateTenantDto } from './dto/tenant.dto.js';

@Injectable()
export class TenantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: TenantContextService,
    private readonly audit: AuditService,
  ) {}

  async getTenant() {
    const tenantId = this.ctx.tenantId;
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        subscription: { include: { plan: true } },
        branches: { orderBy: { name: 'asc' } },
        _count: { select: { students: true, teachers: true, memberships: true } },
      },
    });
    if (!tenant) throw new NotFoundException('Το ωδείο δεν βρέθηκε');

    return {
      ...tenant,
      usage: {
        students: tenant._count.students,
        teachers: tenant._count.teachers,
        members: tenant._count.memberships,
        maxStudents: tenant.subscription?.plan.maxStudents ?? null,
        maxTeachers: tenant.subscription?.plan.maxTeachers ?? null,
      },
    };
  }

  async updateTenant(dto: UpdateTenantDto) {
    const tenant = await this.prisma.tenant.update({
      where: { id: this.ctx.tenantId },
      data: dto,
    });
    await this.audit.record('tenant.settings.updated', 'Tenant', tenant.id, { ...dto });
    return tenant;
  }

  async listBranches() {
    return this.prisma.branch.findMany({
      where: { tenantId: this.ctx.tenantId },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      include: { _count: { select: { students: true, rooms: true } } },
    });
  }

  async createBranch(dto: CreateBranchDto) {
    try {
      const branch = await this.prisma.branch.create({
        data: { ...dto, tenantId: this.ctx.tenantId },
      });
      await this.audit.record('branch.created', 'Branch', branch.id, { code: branch.code });
      return branch;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Υπάρχει ήδη παράρτημα με αυτόν τον κωδικό');
      }
      throw error;
    }
  }

  async updateBranch(id: string, dto: UpdateBranchDto) {
    await this.requireBranch(id);
    try {
      const branch = await this.prisma.branch.update({ where: { id }, data: dto });
      await this.audit.record('branch.updated', 'Branch', branch.id, { ...dto });
      return branch;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Υπάρχει ήδη παράρτημα με αυτόν τον κωδικό');
      }
      throw error;
    }
  }

  async removeBranch(id: string) {
    await this.requireBranch(id);
    try {
      await this.prisma.branch.delete({ where: { id } });
      await this.audit.record('branch.deleted', 'Branch', id);
      return { success: true };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        throw new ConflictException('Το παράρτημα χρησιμοποιείται και δεν μπορεί να διαγραφεί');
      }
      throw error;
    }
  }

  private async requireBranch(id: string) {
    const branch = await this.prisma.branch.findFirst({
      where: { id, tenantId: this.ctx.tenantId },
      select: { id: true },
    });
    if (!branch) throw new NotFoundException('Το παράρτημα δεν βρέθηκε');
  }
}
