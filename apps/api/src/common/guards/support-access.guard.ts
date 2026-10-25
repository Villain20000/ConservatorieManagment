import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import type { Request } from 'express';
import { AuditService } from '../audit.service.js';
import { SUPPORT_PERMISSIONS } from '../permissions.js';
import type { RequestUser } from '../types/request-user.js';
import { PrismaService } from '../../database/prisma.service.js';
import { SupportAccessStatus } from '../../generated/prisma/enums.js';

/** Strict UUID check: anything else must never reach a `uuid` column. */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const TENANT_ONLY_PREFIXES = [
  '/api/platform',
  '/api/auth',
  '/api/health',
  '/api/docs',
];

/**
 * Turns an explicit, time-limited support grant into a read-only synthetic
 * DIRECTOR session for its target tenant.
 *
 * Runs after `JwtAuthGuard` (it needs the authenticated user and CLS) and before
 * `TenantStateGuard` (which must still block suspended tenants for the effective
 * tenant). Platform admins are the only principals allowed to present a grant.
 */
@Injectable()
export class SupportAccessGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
    private readonly audit: AuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: RequestUser }>();
    const header = request.headers['x-support-grant'];
    if (!header) return true;

    if (typeof header !== 'string' || !UUID_PATTERN.test(header)) {
      throw new NotFoundException('Support grant not found');
    }

    const user = request.user;
    if (!user?.isPlatformAdmin) {
      throw new ForbiddenException({ code: 'SUPPORT_GRANT_FORBIDDEN' });
    }

    const path = (request.originalUrl ?? '').split('?')[0] ?? '';
    if (TENANT_ONLY_PREFIXES.some((prefix) => path.startsWith(prefix))) {
      throw new BadRequestException({ code: 'SUPPORT_GRANT_TENANT_ONLY' });
    }

    if (!READ_METHODS.has(request.method)) {
      throw new ForbiddenException({ code: 'SUPPORT_READ_ONLY' });
    }

    const now = new Date();
    const grant = await this.prisma.supportAccessGrant.findUnique({
      where: { id: header },
    });
    if (!grant || grant.actorId !== user.userId) {
      throw new NotFoundException('Support grant not found');
    }

    if (grant.status === SupportAccessStatus.ACTIVE && grant.expiresAt <= now) {
      await this.prisma.supportAccessGrant.updateMany({
        where: { id: grant.id, status: SupportAccessStatus.ACTIVE },
        data: { status: SupportAccessStatus.EXPIRED },
      });
      throw new ForbiddenException({ code: 'SUPPORT_GRANT_EXPIRED' });
    }
    if (grant.status !== SupportAccessStatus.ACTIVE) {
      throw new ForbiddenException({ code: 'SUPPORT_GRANT_INACTIVE' });
    }

    const firstUse = await this.prisma.supportAccessGrant.updateMany({
      where: { id: grant.id, usedAt: null },
      data: { usedAt: now },
    });

    const effectiveUser: RequestUser = {
      ...user,
      tenantId: grant.tenantId,
      membershipId: undefined,
      branchId: null,
      role: 'DIRECTOR',
      permissions: SUPPORT_PERMISSIONS,
      supportGrantId: grant.id,
    };
    this.cls.set('tenantId', grant.tenantId);
    this.cls.set('user', effectiveUser);
    request.user = effectiveUser;

    if (firstUse.count === 1) {
      await this.audit.recordForTenant(
        grant.tenantId,
        'support_access.started',
        'SupportAccessGrant',
        grant.id,
        { ticketRef: grant.ticketRef },
      );
    }
    return true;
  }
}
