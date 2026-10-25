import { Controller, Get, HttpCode, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../../common/decorators/public.decorator.js';
import { PrismaService } from '../../database/prisma.service.js';

interface CheckResult {
  ok: boolean;
  latencyMs?: number;
  failedCount?: number;
  oldestPendingAgeSeconds?: number;
}

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Liveness. Kept byte-identical to the original `AppController.health`
   * because the Playwright harness polls this exact URL and shape.
   */
  @Public()
  @Get()
  health() {
    return {
      status: 'ok',
      service: 'musicos-api',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Readiness. Touches the database and the outbox, so a load balancer can stop
   * routing traffic to an instance that cannot serve it.
   */
  @Public()
  @Get('ready')
  @HttpCode(200)
  async ready(@Res({ passthrough: true }) response: Response) {
    const database = await this.checkDatabase();
    const outbox = await this.checkOutbox();
    const ok = database.ok;

    if (!ok) {
      response.status(503);
    }

    return {
      status: ok ? 'ok' : 'degraded',
      checks: { database, outbox },
      timestamp: new Date().toISOString(),
    };
  }

  private async checkDatabase(): Promise<CheckResult> {
    const startedAt = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { ok: true, latencyMs: Date.now() - startedAt };
    } catch {
      return { ok: false, latencyMs: Date.now() - startedAt };
    }
  }

  /**
   * A growing failed queue is not a reason to fail readiness (the app still
   * serves requests), but it is a reason to show up in the payload.
   */
  private async checkOutbox(): Promise<CheckResult> {
    try {
      const failedCount = await this.prisma.outboxMessage.count({ where: { status: 'FAILED' } });
      const oldest = await this.prisma.outboxMessage.findFirst({
        where: { status: 'PENDING' },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      });
      const oldestPendingAgeSeconds = oldest
        ? Math.max(0, Math.round((Date.now() - oldest.createdAt.getTime()) / 1000))
        : 0;
      return { ok: failedCount === 0, failedCount, oldestPendingAgeSeconds };
    } catch {
      return { ok: false };
    }
  }
}
