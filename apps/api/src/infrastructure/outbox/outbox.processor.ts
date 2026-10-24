import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma.service.js';
import { MAILER, type Mailer } from '../mailer/log.mailer.js';

interface OutboxRow {
  id: string;
  type: string;
  attempts: number;
  payloadJson: Record<string, unknown>;
}

const MAX_ATTEMPTS = 5;

@Injectable()
export class OutboxProcessor {
  private readonly logger = new Logger(OutboxProcessor.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(MAILER) private readonly mailer: Mailer,
  ) {}

  private get enabled(): boolean {
    return this.config.get<string>('SCHEDULER_ENABLED') !== 'false';
  }

  @Interval(15_000)
  async tick(): Promise<void> {
    if (!this.enabled || this.running) return;
    await this.drain();
  }

  async drain(limit = 20): Promise<number> {
    this.running = true;
    try {
      const rows = await this.prisma.$queryRaw<OutboxRow[]>`
        UPDATE "outbox_messages"
        SET "status" = 'SENDING', "lockedAt" = now()
        WHERE "id" IN (
          SELECT "id" FROM "outbox_messages"
          WHERE ("status" = 'PENDING' AND "nextAttemptAt" <= now())
             OR ("status" = 'SENDING' AND "lockedAt" < now() - interval '5 minutes')
          ORDER BY "createdAt"
          LIMIT ${limit}
          FOR UPDATE SKIP LOCKED
        )
        RETURNING "id", "type", "attempts", "payloadJson"
      `;

      for (const row of rows) {
        try {
          await this.deliver(row);
          await this.prisma.outboxMessage.update({
            where: { id: row.id },
            data: { status: 'SENT', sentAt: new Date(), lockedAt: null, lastError: null },
          });
        } catch (error) {
          const attempts = row.attempts + 1;
          const failed = attempts >= MAX_ATTEMPTS;
          await this.prisma.outboxMessage.update({
            where: { id: row.id },
            data: {
              status: failed ? 'FAILED' : 'PENDING',
              attempts,
              lockedAt: null,
              lastError: String(error).slice(0, 500),
              nextAttemptAt: new Date(Date.now() + 2 ** attempts * 60_000),
            },
          });
          this.logger.warn(`Outbox delivery failed for ${row.id}: ${String(error)}`);
        }
      }
      return rows.length;
    } finally {
      this.running = false;
    }
  }

  private async deliver(row: OutboxRow): Promise<void> {
    if (row.type !== 'email') {
      this.logger.debug(`Outbox event ${row.type} acknowledged`);
      return;
    }
    const payload = row.payloadJson as { to?: string; subject?: string; text?: string };
    if (!payload.to || !payload.subject) {
      throw new Error('Email payload is missing recipient or subject');
    }
    await this.mailer.send({
      to: payload.to,
      subject: payload.subject,
      text: payload.text ?? '',
    });
  }
}
