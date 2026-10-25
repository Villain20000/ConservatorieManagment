import type { MailLocale } from '../mailer.types.js';
import {
  buildRows,
  field,
  greeting,
  MISSING_VALUE,
  renderLayout,
  type RenderedMail,
} from './layout.js';

/** Notification that a requested document has been issued. */
export function documentIssued(data: Record<string, unknown>, locale: MailLocale): RenderedMail {
  const greek = locale !== 'en';
  const studentName = field(data, 'studentName');
  const tenantName = field(data, 'tenantName');
  const documentTitle = field(data, 'documentTitle');

  const subject = greek
    ? tenantName
      ? `Έκδοση εγγράφου — ${tenantName}`
      : 'Έκδοση εγγράφου'
    : tenantName
      ? `A document has been issued — ${tenantName}`
      : 'A document has been issued for you';

  const preheader = greek
    ? documentTitle
      ? `Εκδόθηκε το έγγραφο «${documentTitle}».`
      : 'Εκδόθηκε το έγγραφο που ζητήσατε.'
    : documentTitle
      ? `The document “${documentTitle}” has been issued.`
      : 'The document you requested has been issued.';

  const body = greek
    ? 'Σας ενημερώνουμε ότι εκδόθηκε το έγγραφο που έχετε ζητήσει.'
    : 'We would like to let you know that the document you requested has been issued.';

  const rows = buildRows([
    [greek ? 'Σπουδαστής/Σπουδάστρια' : 'Student', studentName ?? MISSING_VALUE],
    [greek ? 'Έγγραφο' : 'Document', documentTitle ?? MISSING_VALUE],
    [greek ? 'Αριθμός πρωτοκόλλου' : 'Protocol number', field(data, 'protocolNumber')],
    [greek ? 'Ημερομηνία έκδοσης' : 'Issue date', field(data, 'issuedAt')],
  ]);

  const { html, text } = renderLayout({
    locale,
    preheader,
    title: greek ? 'Έκδοση εγγράφου' : 'Document issued',
    intro: `${greeting(locale, studentName)}\n\n${body}`,
    rows,
    footer: greek
      ? 'Για την παραλαβή του εγγράφου, επικοινωνήστε με τη γραμματεία.'
      : 'Please contact the office to collect the document.',
  });

  return { subject, html, text };
}
