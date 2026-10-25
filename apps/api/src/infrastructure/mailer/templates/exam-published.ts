import type { MailLocale } from '../mailer.types.js';
import {
  buildRows,
  field,
  greeting,
  MISSING_VALUE,
  renderLayout,
  type RenderedMail,
} from './layout.js';

/**
 * Outcome is normally already localised by the caller, but enum values leak
 * through in practice, so the common ones are translated and anything else is
 * shown as supplied.
 */
const OUTCOME_LABELS: Record<string, { el: string; en: string }> = {
  pass: { el: 'Επιτυχία', en: 'Pass' },
  passed: { el: 'Επιτυχία', en: 'Pass' },
  approved: { el: 'Επιτυχία', en: 'Pass' },
  fail: { el: 'Αποτυχία', en: 'Fail' },
  failed: { el: 'Αποτυχία', en: 'Fail' },
  rejected: { el: 'Αποτυχία', en: 'Fail' },
  pending: { el: 'Σε εκκρεμότητα', en: 'Pending' },
  absent: { el: 'Απουσία', en: 'Absent' },
};

function formatOutcome(raw: string | undefined, greek: boolean): string | undefined {
  if (raw === undefined) {
    return undefined;
  }
  const label = OUTCOME_LABELS[raw.toLowerCase()];
  return label ? (greek ? label.el : label.en) : raw;
}

/** Notification that an exam result has been published. */
export function examPublished(data: Record<string, unknown>, locale: MailLocale): RenderedMail {
  const greek = locale !== 'en';
  const studentName = field(data, 'studentName');
  const tenantName = field(data, 'tenantName');
  const programName = field(data, 'programName');
  const outcome = formatOutcome(field(data, 'outcome'), greek);

  const subject = greek
    ? tenantName
      ? `Αποτελέσματα εξέτασης — ${tenantName}`
      : 'Αποτελέσματα εξέτασης'
    : tenantName
      ? `Your exam results from ${tenantName}`
      : 'Your exam results';

  const preheader = greek
    ? outcome
      ? `Το αποτέλεσμα της εξέτασής σας: ${outcome}.`
      : 'Τα αποτελέσματα της εξέτασής σας είναι διαθέσιμα.'
    : outcome
      ? `Your exam result: ${outcome}.`
      : 'Your exam results are available.';

  const body = greek
    ? 'Τα αποτελέσματα της εξέτασής σας είναι πλέον διαθέσιμα.'
    : 'Your exam results are now available.';

  const rows = buildRows([
    [greek ? 'Σπουδαστής/Σπουδάστρια' : 'Student', studentName ?? MISSING_VALUE],
    [greek ? 'Πρόγραμμα σπουδών' : 'Programme', programName ?? MISSING_VALUE],
    [greek ? 'Ημερομηνία εξέτασης' : 'Exam date', field(data, 'examDate')],
    [greek ? 'Βαθμός' : 'Grade', field(data, 'grade')],
    [greek ? 'Αποτέλεσμα' : 'Outcome', outcome],
  ]);

  const { html, text } = renderLayout({
    locale,
    preheader,
    title: greek ? 'Αποτελέσματα εξέτασης' : 'Exam results',
    intro: `${greeting(locale, studentName)}\n\n${body}`,
    rows,
    footer: greek
      ? 'Για οποιαδήποτε διευκρίνιση σχετικά με τη βαθμολογία, επικοινωνήστε με τη γραμματεία.'
      : 'Please contact the office if you have any questions about your grade.',
  });

  return { subject, html, text };
}
