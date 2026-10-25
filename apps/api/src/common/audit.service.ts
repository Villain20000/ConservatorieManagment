import { Injectable, Logger } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../database/prisma.service.js';
import type { RequestUser } from './types/request-user.js';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
  ) {}

  async record(
    action: string,
    entityType: string,
    entityId?: string | null,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    const tenantId = this.cls.get<string>('tenantId') ?? null;
    try {
      await this.recordForTenant(tenantId, action, entityType, entityId, metadata);
    } catch (error) {
      this.logger.warn(`Audit write failed for ${action}: ${String(error)}`);
    }
  }

  async recordForTenant(
    tenantId: string | null,
    action: string,
    entityType: string,
    entityId?: string | null,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    const user = this.cls.get<RequestUser>('user');
    await this.prisma.auditLog.create({
      data: {
        tenantId,
        actorId: user?.userId ?? null,
        action,
        entityType,
        entityId: entityId ?? null,
        metadata: metadata ? (metadata as object) : undefined,
      },
    });
  }
}
