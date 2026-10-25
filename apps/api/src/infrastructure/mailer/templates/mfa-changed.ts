import type { MailLocale } from '../mailer.types.js';
import { buildRows, field, greeting, renderLayout, type RenderedMail } from './layout.js';

type MfaAction = 'enabled' | 'disabled' | 'recovery-codes-regenerated';

interface ActionCopy {
  intro: { el: string; en: string };
  label: { el: string; en: string };
}

const ACTION_COPY: Record<MfaAction, ActionCopy> = {
  enabled: {
    intro: {
      el: 'Ο έλεγχος ταυτότητας δύο παραγόντων ενεργοποιήθηκε για τον λογαριασμό σας.',
      en: 'Two-factor authentication has been enabled for your account.',
    },
    label: { el: 'Ενεργοποίηση', en: 'Enabled' },
  },
  disabled: {
    intro: {
      el: 'Ο έλεγχος ταυτότητας δύο παραγόντων απενεργοποιήθηκε για τον λογαριασμό σας.',
      en: 'Two-factor authentication has been disabled for your account.',
    },
    label: { el: 'Απενεργοποίηση', en: 'Disabled' },
  },
  'recovery-codes-regenerated': {
    intro: {
      el: 'Δημιουργήθηκαν νέοι κωδικοί ανάκτησης για τον λογαριασμό σας. Οι προηγούμενοι κωδικοί δεν ισχύουν πλέον.',
      en: 'New recovery codes were generated for your account. Your previous codes no longer work.',
    },
    label: { el: 'Νέοι κωδικοί ανάκτησης', en: 'Recovery codes regenerated' },
  },
};

function resolveAction(raw: string | undefined): MfaAction | undefined {
  if (raw === undefined) {
    return undefined;
  }
  const normalised = raw.toLowerCase();
  return normalised in ACTION_COPY ? (normalised as MfaAction) : undefined;
}

/** Security notice after a two-factor authentication change. */
export function mfaChanged(data: Record<string, unknown>, locale: MailLocale): RenderedMail {
  const greek = locale !== 'en';
  const userName = field(data, 'userName');
  const action = resolveAction(field(data, 'action'));

  const subject = greek
    ? 'Αλλαγή ρυθμίσεων ασφαλείας'
    : 'Security settings changed';

  const intro = action
    ? ACTION_COPY[action].intro[greek ? 'el' : 'en']
    : greek
      ? 'Οι ρυθμίσεις ελέγχου ταυτότητας δύο παραγόντων άλλαξαν για τον λογαριασμό σας.'
      : 'The two-factor authentication settings for your account have changed.';

  const rows = buildRows([
    [greek ? 'Χρήστης' : 'Account', userName],
    [greek ? 'Ενέργεια' : 'Action', action ? ACTION_COPY[action].label[greek ? 'el' : 'en'] : undefined],
    [greek ? 'Ημερομηνία' : 'Date', field(data, 'occurredAt')],
  ]);

  const { html, text } = renderLayout({
    locale,
    preheader: intro,
    title: greek ? 'Αλλαγή ρυθμίσεων ασφαλείας' : 'Security settings updated',
    intro: `${greeting(locale, userName)}\n\n${intro}`,
    rows,
    footer: greek
      ? 'Αν δεν αναγνωρίζετε αυτή την αλλαγή, επικοινωνήστε αμέσως με τον διαχειριστή του λογαριασμού.'
      : 'If you do not recognise this change, contact your administrator immediately.',
  });

  return { subject, html, text };
}
