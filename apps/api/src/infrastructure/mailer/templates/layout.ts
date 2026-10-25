/**
 * Shared layout for transactional mail.
 *
 * Conservatory mail clients range from modern webmail to Outlook on a ten year
 * old desktop, so the HTML is deliberately boring: tables, inline styles only,
 * no `<style>` block, no external CSS, no remote images. Everything that comes
 * from template data is escaped here — the individual templates never build
 * markup themselves, they only describe rows and copy.
 */
import type { MailLocale } from '../mailer.types.js';

export interface RenderedMail {
  subject: string;
  html: string;
  text: string;
}

export interface LayoutRow {
  label: string;
  value: string;
}

export interface LayoutInput {
  locale: MailLocale;
  preheader?: string;
  title: string;
  intro?: string;
  rows?: LayoutRow[];
  cta?: { label: string; url: string };
  footer?: string;
}

export interface LayoutOutput {
  html: string;
  text: string;
}

/** Placeholder used instead of an empty cell when a required field is absent. */
export const MISSING_VALUE = '—';

const FONT_STACK = "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const COLORS = {
  page: '#f5f3ee',
  surface: '#ffffff',
  text: '#1c2430',
  muted: '#5d6a78',
  brand: '#b9893d',
  border: '#e3ded4',
} as const;

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escapes a value for use in HTML text or in a double-quoted attribute. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => HTML_ESCAPES[character] ?? character);
}

/** Escapes, then turns author line breaks into `<br />` so paragraphs survive. */
function toHtmlText(value: string): string {
  return escapeHtml(value).replace(/\r\n|\r|\n/g, '<br />');
}

/**
 * Reads an optional template value.
 *
 * Only strings and finite numbers survive: a missing field, an empty string or
 * a stray object becomes `undefined` so a template can omit the row instead of
 * printing `undefined` or `[object Object]`.
 */
export function field(data: Record<string, unknown>, key: string): string | undefined {
  const raw = data[key];
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return String(raw);
  }
  return undefined;
}

/** Drops rows whose value is missing, keeping label order stable. */
export function buildRows(
  entries: ReadonlyArray<readonly [string, string | undefined]>,
): LayoutRow[] {
  const rows: LayoutRow[] = [];
  for (const [label, value] of entries) {
    if (value !== undefined) {
      rows.push({ label, value });
    }
  }
  return rows;
}

/** Natural salutation, used by the templates that address a single person. */
export function greeting(locale: MailLocale, name?: string): string {
  const greek = locale !== 'en';
  if (name) {
    return greek ? `Αγαπητέ/ή ${name},` : `Dear ${name},`;
  }
  return greek ? 'Γεια σας,' : 'Hello,';
}

const DEFAULT_FOOTER: Record<MailLocale, string> = {
  el: 'Το μήνυμα στάλθηκε αυτόματα. Παρακαλούμε μην απαντήσετε σε αυτή τη διεύθυνση.',
  en: 'This message was sent automatically. Please do not reply to this address.',
};

function renderRows(rows: LayoutRow[]): string {
  if (rows.length === 0) {
    return '';
  }

  const body = rows
    .map(
      (row) => `<tr>
<td style="padding:10px 0;border-top:1px solid ${COLORS.border};font-family:${FONT_STACK};font-size:13px;line-height:1.45;color:${COLORS.muted};vertical-align:top;width:45%;">${escapeHtml(row.label)}</td>
<td style="padding:10px 0;border-top:1px solid ${COLORS.border};font-family:${FONT_STACK};font-size:15px;line-height:1.5;color:${COLORS.text};vertical-align:top;text-align:right;width:55%;">${escapeHtml(row.value)}</td>
</tr>`,
    )
    .join('\n');

  return `<tr><td style="padding:8px 32px 24px 32px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;">
${body}
</table>
</td></tr>`;
}

function renderCta(cta: LayoutInput['cta']): string {
  const url = cta?.url.trim();
  if (!cta || !url) {
    return '';
  }

  return `<tr><td style="padding:8px 32px 28px 32px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0">
<tr><td style="background-color:${COLORS.brand};border-radius:8px;">
<a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 22px;font-family:${FONT_STACK};font-size:15px;font-weight:600;line-height:1.2;color:${COLORS.surface};text-decoration:none;">${escapeHtml(cta.label)}</a>
</td></tr>
</table>
<div style="margin-top:14px;font-family:${FONT_STACK};font-size:12px;line-height:1.5;color:${COLORS.muted};word-break:break-all;">${escapeHtml(url)}</div>
</td></tr>`;
}

/**
 * Renders the shared card in both flavours.
 *
 * The HTML escapes every interpolated value; the text version keeps values
 * literal so a plain-text client shows what was actually written.
 */
export function renderLayout(input: LayoutInput): LayoutOutput {
  const lang: MailLocale = input.locale === 'en' ? 'en' : 'el';
  const rows = input.rows ?? [];
  const footer = input.footer?.trim() || DEFAULT_FOOTER[lang];
  const intro = input.intro?.trim();
  const ctaUrl = input.cta?.url.trim();

  const preheaderHtml = `<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:${COLORS.page};">${escapeHtml(
    input.preheader ?? '',
  )}</div>`;

  const titleHtml = `<tr><td style="padding:32px 32px 0 32px;font-family:${FONT_STACK};font-size:20px;font-weight:700;line-height:1.35;color:${COLORS.text};">${escapeHtml(
    input.title,
  )}</td></tr>
<tr><td style="padding:14px 32px 0 32px;"><div style="width:40px;height:3px;border-radius:2px;background-color:${COLORS.brand};font-size:0;line-height:0;">&nbsp;</div></td></tr>`;

  const introHtml = intro
    ? `<tr><td style="padding:16px 32px 0 32px;font-family:${FONT_STACK};font-size:15px;line-height:1.6;color:${COLORS.text};">${toHtmlText(
        intro,
      )}</td></tr>`
    : '';

  const footerHtml = `<tr><td style="padding:18px 32px 28px 32px;border-top:1px solid ${COLORS.border};font-family:${FONT_STACK};font-size:12px;line-height:1.6;color:${COLORS.muted};">${toHtmlText(
    footer,
  )}</td></tr>`;

  const html = [
    '<!doctype html>',
    `<html lang="${lang}" dir="ltr">`,
    '<head>',
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    '<meta name="color-scheme" content="light" />',
    `<title>${escapeHtml(input.title)}</title>`,
    '</head>',
    `<body style="margin:0;padding:0;background-color:${COLORS.page};">`,
    preheaderHtml,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background-color:${COLORS.page};">`,
    '<tr>',
    '<td align="center" style="padding:24px 12px;">',
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;background-color:${COLORS.surface};border:1px solid ${COLORS.border};border-radius:10px;">`,
    titleHtml,
    introHtml,
    renderRows(rows),
    renderCta(input.cta),
    footerHtml,
    '</table>',
    '</td>',
    '</tr>',
    '</table>',
    '</body>',
    '</html>',
  ]
    .filter((part) => part !== '')
    .join('\n');

  const textParts: string[] = [input.title];
  if (intro) {
    textParts.push('', intro);
  }
  if (rows.length > 0) {
    textParts.push('');
    for (const row of rows) {
      textParts.push(`${row.label}: ${row.value}`);
    }
  }
  if (input.cta && ctaUrl) {
    textParts.push('', `${input.cta.label.trim()}:`, ctaUrl);
  }
  textParts.push('', footer);

  return { html, text: textParts.join('\n') };
}
