import { MailDeliveryError } from '../mailer.types.js';
import type { MailLocale, MailTemplateKey } from '../mailer.types.js';
import { announcement } from './announcement.js';
import { documentIssued } from './document-issued.js';
import { examPublished } from './exam-published.js';
import type { RenderedMail } from './layout.js';
import { mfaChanged } from './mfa-changed.js';
import { overdueReminder } from './overdue-reminder.js';
import { passwordReset } from './password-reset.js';
import { receipt } from './receipt.js';

export type TemplateRenderer = (
  data: Record<string, unknown>,
  locale: MailLocale,
) => RenderedMail;

/**
 * Every transactional template, keyed by the `MailTemplateKey` the outbox uses.
 *
 * The record is exhaustive by type, so adding a key to `MailTemplateKey`
 * without a renderer is a compile error rather than a runtime surprise.
 */
export const TEMPLATES: Record<MailTemplateKey, TemplateRenderer> = {
  receipt,
  'overdue-reminder': overdueReminder,
  'exam-published': examPublished,
  'document-issued': documentIssued,
  announcement,
  'password-reset': passwordReset,
  'mfa-changed': mfaChanged,
};

/**
 * Renders a template by key.
 *
 * An unknown key is a programming error, not a transient one, so it is reported
 * as non-retryable: the outbox should surface it immediately instead of burning
 * its retry budget. The same applies to a renderer that throws — retrying the
 * same data would fail identically.
 */
export function renderTemplate(
  key: MailTemplateKey,
  data: Record<string, unknown>,
  locale: MailLocale,
): RenderedMail {
  const renderer = (TEMPLATES as Record<string, TemplateRenderer | undefined>)[key];

  if (!renderer) {
    throw new MailDeliveryError(
      'TEMPLATE_MISSING',
      false,
      `Unknown mail template: ${String(key)}`,
    );
  }

  try {
    return renderer(data ?? {}, locale === 'en' ? 'en' : 'el');
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new MailDeliveryError(
      'TEMPLATE_RENDER_FAILED',
      false,
      `Failed to render mail template "${key}" (${locale}): ${reason}`,
    );
  }
}
