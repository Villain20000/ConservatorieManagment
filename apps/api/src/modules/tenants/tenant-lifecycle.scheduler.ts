import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma.service.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_GRACE_DAYS = 7;

/**
 * Flips trials that are past `trialEndsAt + TRIAL_GRACE_DAYS` to `SUSPENDED`.
 *
 * Reads never mutate, so `EntitlementsService` reports `TRIAL_EXPIRED` on its
 * own; this job is the only writer that ends a trial. That split keeps the read
 * path safe to call from a guard on every request.
 *
 * Idempotent: re-running on the same day only touches rows that are still TRIAL
 * and still past the window.
 */
@Injectable()
export class TenantLifecycleScheduler {
  private readonly logger = new Logger(TenantLifecycleScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private get enabled(): boolean {
    return this.config.get<string>('SCHEDULER_ENABLED') !== 'false';
  }

  private get graceDays(): number {
    const raw = Number(this.config.get<string>('TRIAL_GRACE_DAYS') ?? DEFAULT_GRACE_DAYS);
    return Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_GRACE_DAYS;
  }

  @Cron('0 4 * * *', { timeZone: 'Europe/Athens' })
  async sweep(): Promise<number> {
    if (!this.enabled) return 0;

    const cutoff = new Date(Date.now() - this.graceDays * DAY_MS);

    const expired = await this.prisma.tenant.findMany({
      where: {
        status: 'TRIAL',
        subscription: { trialEndsAt: { lt: cutoff } },
      },
      select: { id: true, name: true },
    });

    if (expired.length === 0) return 0;

    await this.prisma.$transaction(async (tx) => {
      for (const tenant of expired) {
        await tx.tenant.update({
          where: { id: tenant.id },
          data: {
            status: 'SUSPENDED',
            suspendedAt: new Date(),
            suspensionReason: 'trial_expired',
          },
        });
        await tx.auditLog.create({
          data: {
            tenantId: tenant.id,
            action: 'tenant.suspended',
            entityType: 'Tenant',
            entityId: tenant.id,
            metadata: { reason: 'trial_expired', graceDays: this.graceDays },
          },
        });
      }
    });

    this.logger.warn(`Suspended ${expired.length} tenant(s) after trial expiry`);
    return expired.length;
  }
}
