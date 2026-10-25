import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { AuditService } from '../../common/audit.service.js';
import { pageMeta } from '../../common/dto/pagination.dto.js';
import type { RequestUser } from '../../common/types/request-user.js';
import { PrismaService } from '../../database/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import { SupportAccessStatus } from '../../generated/prisma/enums.js';
import type {
  CreateSupportGrantDto,
  SupportGrantQueryDto,
} from './dto/support-access.dto.js';

const grantInclude = {
  tenant: { select: { id: true, name: true, slug: true } },
  actor: { select: { id: true, firstName: true, lastName: true, email: true } },
} as const;

type GrantWithRelations = Prisma.SupportAccessGrantGetPayload<{
  include: typeof grantInclude;
}>;

@Injectable()
export class SupportAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateSupportGrantDto) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: dto.tenantId },
      select: { id: true },
    });
    if (!tenant) throw new NotFoundException('Το ωδείο δεν βρέθηκε');

    const expiresAt = new Date(Date.now() + dto.expiresInMinutes * 60_000);
    const actorId = this.actorId();

    const grant = await this.prisma.supportAccessGrant.create({
      data: {
        tenantId: dto.tenantId,
        actorId,
        reason: dto.reason,
        ticketRef: dto.ticketRef ?? null,
        status: SupportAccessStatus.ACTIVE,
        expiresAt,
      },
      include: grantInclude,
    });

    await this.audit.recordForTenant(
      dto.tenantId,
      'support_access.granted',
      'SupportAccessGrant',
      grant.id,
      { ticketRef: grant.ticketRef, expiresAt: grant.expiresAt },
    );

    return grant;
  }

  async list(query: SupportGrantQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const where: Prisma.SupportAccessGrantWhereInput = {};
    if (query.tenantId) where.tenantId = query.tenantId;
    if (query.status) where.status = query.status;

    const [grants, total] = await Promise.all([
      this.prisma.supportAccessGrant.findMany({
        where,
        include: grantInclude,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.supportAccessGrant.count({ where }),
    ]);

    return { data: grants, meta: pageMeta(total, page, pageSize) };
  }

  async get(id: string) {
    const grant = await this.prisma.supportAccessGrant.findUnique({
      where: { id },
      include: grantInclude,
    });
    if (!grant)
      throw new NotFoundException('Η παραχώρηση πρόσβασης δεν βρέθηκε');
    return grant;
  }

  async revoke(id: string) {
    const grant = await this.prisma.supportAccessGrant.findUnique({
      where: { id },
      include: grantInclude,
    });
    if (!grant)
      throw new NotFoundException('Η παραχώρηση πρόσβασης δεν βρέθηκε');
    return this.revokeGrant(grant, grant.tenantId);
  }

  async listForTenant(tenantId: string) {
    const grants = await this.prisma.supportAccessGrant.findMany({
      where: { tenantId },
      include: grantInclude,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return { data: grants };
  }

  async revokeForTenant(tenantId: string, id: string) {
    const grant = await this.prisma.supportAccessGrant.findFirst({
      where: { id, tenantId },
      include: grantInclude,
    });
    if (!grant)
      throw new NotFoundException('Η παραχώρηση πρόσβασης δεν βρέθηκε');
    // Audit for the grant's own tenant, never the caller's session.
    return this.revokeGrant(grant, grant.tenantId);
  }

  private async revokeGrant(
    grant: GrantWithRelations,
    tenantId: string,
  ): Promise<GrantWithRelations> {
    if (grant.status !== SupportAccessStatus.ACTIVE) {
      return grant;
    }

    const revokedById = this.actorId();
    const revoked = await this.prisma.supportAccessGrant.update({
      where: { id: grant.id },
      data: {
        status: SupportAccessStatus.REVOKED,
        revokedAt: new Date(),
        revokedById,
      },
      include: grantInclude,
    });

    await this.audit.recordForTenant(
      tenantId,
      'support_access.revoked',
      'SupportAccessGrant',
      grant.id,
      { ticketRef: grant.ticketRef },
    );

    return revoked;
  }

  private actorId(): string {
    const user = this.cls.get<RequestUser>('user');
    if (!user) throw new ForbiddenException('Δεν υπάρχει ενεργή συνεδρία');
    return user.userId;
  }
}
