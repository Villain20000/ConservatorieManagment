import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma.service.js';
import {
  MAILER,
  MailDeliveryError,
  type MailLocale,
  type MailTemplateKey,
  type Mailer,
} from '../mailer/mailer.types.js';

interface OutboxRow {
  id: string;
  type: string;
  attempts: number;
  payloadJson: Record<string, unknown>;
}

interface EmailPayload {
  to?: string;
  subject?: string;
  text?: string;
  template?: MailTemplateKey;
  data?: Record<string, unknown>;
  locale?: MailLocale;
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
          const retryable = error instanceof MailDeliveryError ? error.retryable : true;

          // A permanent failure is not going to succeed on the fifth attempt
          // either, so surface it on the first one and stop spending the budget.
          if (!retryable) {
            await this.prisma.outboxMessage.update({
              where: { id: row.id },
              data: {
                status: 'FAILED',
                lockedAt: null,
                lastError: String(error).slice(0, 500),
              },
            });
            this.logger.error(`Outbox delivery failed permanently for ${row.id}: ${String(error)}`);
            continue;
          }

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

    const payload = row.payloadJson as EmailPayload;
    if (!payload.to) {
      throw new MailDeliveryError('PAYLOAD_INVALID', false, 'Email payload is missing recipient');
    }

    // Template payloads are rendered by the mailer, so locale and escaping stay
    // in one place. Rows written before templates existed carry a subject and a
    // body instead and are still delivered as they are.
    if (payload.template) {
      await this.mailer.send({
        to: payload.to,
        template: payload.template,
        data: payload.data,
        locale: payload.locale,
      });
      return;
    }

    if (!payload.subject) {
      throw new MailDeliveryError(
        'PAYLOAD_INVALID',
        false,
        'Email payload has neither a template nor a subject',
      );
    }

    await this.mailer.send({
      to: payload.to,
      subject: payload.subject,
      text: payload.text ?? '',
    });
  }
}
