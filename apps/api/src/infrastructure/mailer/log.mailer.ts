import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Mailer, MailMessage } from './mailer.types.js';
import { renderTemplate } from './templates/index.js';

export { MAILER } from './mailer.types.js';
export type { Mailer, MailMessage } from './mailer.types.js';

interface ResolvedLog {
  subject: string;
  text?: string;
}

/**
 * Development transport: writes what would have been sent to the log.
 *
 * It is the fallback when `SMTP_URL` is unset, so it must never throw — a
 * missing template should make the log line less informative, not break the
 * caller that queued the message.
 */
@Injectable()
export class LogMailer implements Mailer {
  private readonly logger = new Logger(LogMailer.name);

  constructor(private readonly config: ConfigService) {}

  async send(message: MailMessage): Promise<void> {
    const { subject, text } = this.resolve(message);
    const template = message.template ? ` [${message.template}]` : '';

    this.logger.log(`Local mail delivery → ${message.to} — ${subject}${template}`);

    if (this.logBody && text) {
      this.logger.debug(text);
    }
  }

  private get logBody(): boolean {
    return this.config.get<string>('MAIL_LOG_BODY') === 'true';
  }

  private resolve(message: MailMessage): ResolvedLog {
    if (!message.template) {
      return { subject: message.subject ?? '(no subject)', text: message.text };
    }

    try {
      const rendered = renderTemplate(
        message.template,
        message.data ?? {},
        message.locale ?? 'el',
      );
      return { subject: rendered.subject, text: message.text ?? rendered.text };
    } catch {
      return { subject: message.subject ?? '(unrendered template)', text: message.text };
    }
  }
}
