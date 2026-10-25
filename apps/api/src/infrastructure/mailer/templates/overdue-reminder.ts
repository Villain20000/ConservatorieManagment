import type { MailLocale } from '../mailer.types.js';
import {
  buildRows,
  field,
  greeting,
  MISSING_VALUE,
  renderLayout,
  type RenderedMail,
} from './layout.js';

/** Formats the overdue counter as a localised duration, or passes it through. */
function formatDaysOverdue(raw: string | undefined, greek: boolean): string | undefined {
  if (raw === undefined) {
    return undefined;
  }
  if (!/^\d+$/.test(raw)) {
    return raw;
  }
  if (greek) {
    return raw === '1' ? '1 ημέρα' : `${raw} ημέρες`;
  }
  return raw === '1' ? '1 day' : `${raw} days`;
}

/** Gentle nudge for an outstanding balance. */
export function overdueReminder(data: Record<string, unknown>, locale: MailLocale): RenderedMail {
  const greek = locale !== 'en';
  const studentName = field(data, 'studentName');
  const tenantName = field(data, 'tenantName');
  const amount = field(data, 'amount');
  const daysOverdue = formatDaysOverdue(field(data, 'daysOverdue'), greek);

  const subject = greek
    ? tenantName
      ? `Υπενθύμιση για εκκρεμή οφειλή — ${tenantName}`
      : 'Υπενθύμιση για εκκρεμή οφειλή'
    : tenantName
      ? `Payment reminder from ${tenantName}`
      : 'Payment reminder';

  const preheader = greek
    ? amount
      ? `Εκκρεμεί η εξόφληση ποσού ${amount}.`
      : 'Εκκρεμεί η εξόφληση της οφειλής σας.'
    : amount
      ? `A balance of ${amount} is still outstanding.`
      : 'Your balance is still outstanding.';

  const body = greek
    ? 'Σας υπενθυμίζουμε ότι εκκρεμεί η εξόφληση της οφειλής σας. Αν έχετε ήδη καταβάλει το ποσό, παρακαλούμε αγνοήστε το μήνυμα.'
    : 'This is a reminder that your payment is still outstanding. If you have already paid, please disregard this message.';

  const rows = buildRows([
    [greek ? 'Σπουδαστής/Σπουδάστρια' : 'Student', studentName ?? MISSING_VALUE],
    [greek ? 'Ποσό' : 'Amount', amount ?? MISSING_VALUE],
    [greek ? 'Ημερομηνία λήξης' : 'Due date', field(data, 'dueDate')],
    [greek ? 'Καθυστέρηση' : 'Days overdue', daysOverdue],
  ]);

  const { html, text } = renderLayout({
    locale,
    preheader,
    title: greek ? 'Υπενθύμιση οφειλής' : 'Payment reminder',
    intro: `${greeting(locale, studentName)}\n\n${body}`,
    rows,
    footer: greek
      ? 'Για διευκρινίσεις σχετικά με την οφειλή, επικοινωνήστε με τη γραμματεία.'
      : 'Please contact the office if you have any questions about this balance.',
  });

  return { subject, html, text };
}
