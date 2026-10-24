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
    const user = this.cls.get<RequestUser>('user');
    try {
      await this.prisma.auditLog.create({
        data: {
          tenantId: this.cls.get<string>('tenantId') ?? null,
          actorId: user?.userId ?? null,
          action,
          entityType,
          entityId: entityId ?? null,
          metadata: metadata ? (metadata as object) : undefined,
        },
      });
    } catch (error) {
      this.logger.warn(`Audit write failed for ${action}: ${String(error)}`);
    }
  }
}
