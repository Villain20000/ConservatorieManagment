/**
 * Mail contracts.
 *
 * These types are the seam between the outbox, the templates and the transport.
 * Nothing here knows about SMTP — `SmtpMailer` is one implementation, `LogMailer`
 * is another, and both are selected by `createMailer()`.
 */

export type MailLocale = 'el' | 'en';

/** Every transactional email the platform can send. */
export type MailTemplateKey =
  | 'receipt'
  | 'overdue-reminder'
  | 'exam-published'
  | 'document-issued'
  | 'announcement'
  | 'password-reset'
  | 'mfa-changed';

/**
 * A message may be supplied either fully rendered (`subject` + `html`/`text`)
 * or as a template reference (`template` + `data`) that the outbox renders.
 * The template form is preferred because it keeps locale and escaping in one place.
 */
export interface MailMessage {
  to: string;
  subject?: string;
  text?: string;
  html?: string;
  template?: MailTemplateKey;
  data?: Record<string, unknown>;
  locale?: MailLocale;
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

export const MAILER = 'MAILER';

/**
 * A delivery failure that knows whether retrying can possibly help.
 *
 * The outbox uses this to avoid burning the whole retry budget on a permanent
 * failure (bad credentials, rejected recipient, unknown template) and to surface
 * the real error to an operator on the first attempt instead of the fifth.
 */
export class MailDeliveryError extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(code: string, retryable: boolean, message?: string) {
    super(message ?? code);
    this.name = 'MailDeliveryError';
    this.code = code;
    this.retryable = retryable;
  }
}
