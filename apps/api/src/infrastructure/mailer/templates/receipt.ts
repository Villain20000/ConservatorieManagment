import type { MailLocale } from '../mailer.types.js';
import {
  buildRows,
  field,
  greeting,
  MISSING_VALUE,
  renderLayout,
  type RenderedMail,
} from './layout.js';

/** Confirmation that a payment was recorded. */
export function receipt(data: Record<string, unknown>, locale: MailLocale): RenderedMail {
  const greek = locale !== 'en';
  const studentName = field(data, 'studentName');
  const tenantName = field(data, 'tenantName');
  const amount = field(data, 'amount');

  const subject = greek
    ? tenantName
      ? `Η απόδειξή σας από ${tenantName}`
      : 'Η απόδειξή σας'
    : tenantName
      ? `Your receipt from ${tenantName}`
      : 'Your receipt';

  const preheader = greek
    ? amount
      ? `Καταχωρήθηκε πληρωμή ύψους ${amount}.`
      : 'Καταχωρήθηκε η πληρωμή σας.'
    : amount
      ? `Your payment of ${amount} has been recorded.`
      : 'Your payment has been recorded.';

  const body = greek
    ? 'Σας ευχαριστούμε για την πληρωμή σας. Παρακάτω θα βρείτε τα στοιχεία της απόδειξης.'
    : 'Thank you for your payment. The receipt details are below.';

  const rows = buildRows([
    [greek ? 'Σπουδαστής/Σπουδάστρια' : 'Student', studentName ?? MISSING_VALUE],
    [greek ? 'Ποσό' : 'Amount', amount ?? MISSING_VALUE],
    [greek ? 'Αριθμός απόδειξης' : 'Receipt number', field(data, 'receiptNumber') ?? MISSING_VALUE],
    [greek ? 'Ημερομηνία πληρωμής' : 'Payment date', field(data, 'paidAt')],
    [greek ? 'Τρόπος πληρωμής' : 'Payment method', field(data, 'method')],
  ]);

  const { html, text } = renderLayout({
    locale,
    preheader,
    title: greek ? 'Απόδειξη πληρωμής' : 'Payment receipt',
    intro: `${greeting(locale, studentName)}\n\n${body}`,
    rows,
    footer: greek
      ? 'Το μήνυμα στάλθηκε αυτόματα. Για οποιαδήποτε διευκρίνιση, επικοινωνήστε με τη γραμματεία.'
      : 'This message was sent automatically. Please contact the office if you have any questions.',
  });

  return { subject, html, text };
}
