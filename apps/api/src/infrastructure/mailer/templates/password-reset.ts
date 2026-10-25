import type { MailLocale } from '../mailer.types.js';
import { buildRows, field, greeting, renderLayout, type RenderedMail } from './layout.js';

/** Formats the link lifetime as a localised duration, or passes it through. */
function formatExpiry(raw: string | undefined, greek: boolean): string | undefined {
  if (raw === undefined) {
    return undefined;
  }
  if (!/^\d+$/.test(raw)) {
    return raw;
  }
  if (greek) {
    return raw === '1' ? '1 λεπτό' : `${raw} λεπτά`;
  }
  return raw === '1' ? '1 minute' : `${raw} minutes`;
}

/** Password reset link, sent only after an explicit request. */
export function passwordReset(data: Record<string, unknown>, locale: MailLocale): RenderedMail {
  const greek = locale !== 'en';
  const userName = field(data, 'userName');
  const resetUrl = field(data, 'resetUrl');
  const expiresIn = formatExpiry(field(data, 'expiresInMinutes'), greek);

  const subject = greek ? 'Επαναφορά κωδικού πρόσβασης' : 'Reset your password';

  const preheader = greek
    ? expiresIn
      ? `Ο σύνδεσμος επαναφοράς ισχύει για ${expiresIn}.`
      : 'Ο σύνδεσμος επαναφοράς κωδικού είναι έτοιμος.'
    : expiresIn
      ? `Your reset link is valid for ${expiresIn}.`
      : 'Your password reset link is ready.';

  const body = greek
    ? 'Λάβαμε αίτημα για την επαναφορά του κωδικού πρόσβασης του λογαριασμού σας. Πατήστε τον παρακάτω σύνδεσμο για να ορίσετε νέο κωδικό.'
    : 'We received a request to reset the password for your account. Use the link below to choose a new password.';

  const rows = buildRows([
    [greek ? 'Χρήστης' : 'Account', userName],
    [greek ? 'Ισχύς συνδέσμου' : 'Link valid for', expiresIn],
  ]);

  const { html, text } = renderLayout({
    locale,
    preheader,
    title: greek ? 'Επαναφορά κωδικού' : 'Reset your password',
    intro: `${greeting(locale, userName)}\n\n${body}`,
    rows,
    cta: resetUrl
      ? { label: greek ? 'Ορισμός νέου κωδικού' : 'Choose a new password', url: resetUrl }
      : undefined,
    footer: greek
      ? 'Αν δεν ζητήσατε εσείς την επαναφορά, αγνοήστε αυτό το μήνυμα. Ο κωδικός σας παραμένει ίδιος.'
      : 'If you did not request this, you can ignore this message. Your password will stay the same.',
  });

  return { subject, html, text };
}
