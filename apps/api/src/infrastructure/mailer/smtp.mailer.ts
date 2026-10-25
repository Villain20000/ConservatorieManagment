import type { Transporter } from 'nodemailer';
import { MailDeliveryError } from './mailer.types.js';
import type { Mailer, MailMessage } from './mailer.types.js';
import { renderTemplate } from './templates/index.js';

/**
 * SMTP failures that retrying cannot fix: bad credentials, a rejected envelope,
 * a malformed message, or the process not being allowed to reach the network.
 */
const PERMANENT_CODES = new Set(['EAUTH', 'EENVELOPE', 'EMESSAGE', 'EACCES']);

/**
 * SMTP failures that are worth another attempt: the server was unreachable,
 * the connection dropped, or a DNS lookup did not resolve in time.
 */
const TRANSIENT_CODES = new Set([
  'ECONNECTION',
  'ECONNRESET',
  'ETIMEDOUT',
  'ESOCKET',
  'EDNS',
  'ECONNREFUSED',
  'EAI_AGAIN',
]);

interface ResolvedContent {
  subject: string;
  html?: string;
  text?: string;
}

/**
 * The real SMTP transport.
 *
 * The transporter is injected rather than built here so the delivery rules can
 * be exercised without a mail server, and so the factory owns connection setup.
 */
export class SmtpMailer implements Mailer {
  constructor(
    private readonly transporter: Transporter,
    private readonly from: string,
    private readonly replyTo?: string,
  ) {}

  async send(message: MailMessage): Promise<void> {
    const content = this.resolveContent(message);

    try {
      await this.transporter.sendMail({
        from: this.from,
        to: message.to,
        replyTo: this.replyTo,
        subject: content.subject,
        html: content.html,
        text: content.text,
      });
    } catch (error) {
      throw this.toDeliveryError(error);
    }
  }

  /**
   * Renders the message, preferring the template form so locale and escaping
   * stay in one place. A render failure is already a `MailDeliveryError` and
   * escapes unchanged, which keeps it non-retryable.
   */
  private resolveContent(message: MailMessage): ResolvedContent {
    if (message.template) {
      const rendered = renderTemplate(
        message.template,
        message.data ?? {},
        message.locale ?? 'el',
      );
      return { subject: rendered.subject, html: rendered.html, text: rendered.text };
    }

    if (!message.subject) {
      throw new MailDeliveryError(
        'MESSAGE_INVALID',
        false,
        'Mail message has neither a template nor a subject',
      );
    }

    if (!message.html && !message.text) {
      throw new MailDeliveryError(
        'MESSAGE_INVALID',
        false,
        `Mail message "${message.subject}" has no html or text body`,
      );
    }

    return { subject: message.subject, html: message.html, text: message.text };
  }

  private toDeliveryError(error: unknown): MailDeliveryError {
    const code = readString(error, 'code');
    const responseCode = readNumber(error, 'responseCode');
    const message = this.describe(error, code, responseCode);

    if (code && PERMANENT_CODES.has(code)) {
      return new MailDeliveryError(code, false, message);
    }

    if (responseCode !== undefined && responseCode >= 500) {
      return new MailDeliveryError(code ?? 'ESMTP', false, message);
    }

    if (code && TRANSIENT_CODES.has(code)) {
      return new MailDeliveryError(code, true, message);
    }

    if (responseCode !== undefined && responseCode >= 400 && responseCode < 500) {
      return new MailDeliveryError(code ?? 'ESMTP', true, message);
    }

    // An unrecognised failure is retried: a few duplicate attempts are cheaper
    // than silently dropping a receipt.
    return new MailDeliveryError(code ?? 'EUNKNOWN', true, message);
  }

  /**
   * Builds the operator-facing message from the code and the server reply.
   * Credentials are stripped: the outbox stores this in `lastError`, which is
   * readable by anyone with database access.
   */
  private describe(error: unknown, code?: string, responseCode?: number): string {
    const label = [code, responseCode === undefined ? undefined : String(responseCode)]
      .filter(Boolean)
      .join(' ');

    const detail = this.redact(readString(error, 'response') ?? readString(error, 'message') ?? '');
    if (!detail) {
      return label || 'Mail delivery failed';
    }

    return label ? `${label}: ${detail}` : detail;
  }

  private redact(text: string): string {
    return text
      .replace(/(\/\/)[^\s/@]+@/g, '$1***@')
      .replace(/\b(pass|password|passwd|secret|token|api[_-]?key)\s*[=:]\s*\S+/gi, '$1=***');
  }
}

function readString(value: unknown, key: string): string | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === 'string' && candidate.length > 0 ? candidate : undefined;
}

function readNumber(value: unknown, key: string): number | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === 'number' && Number.isFinite(candidate) ? candidate : undefined;
}
