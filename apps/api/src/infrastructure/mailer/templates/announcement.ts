import type { MailLocale } from '../mailer.types.js';
import { buildRows, field, renderLayout, type RenderedMail } from './layout.js';

/** Collapses the body to a single inbox preview line. */
function preheaderFor(body: string | undefined): string | undefined {
  if (!body) {
    return undefined;
  }
  const firstLine = body.split(/\r\n|\r|\n/)[0]?.trim();
  if (!firstLine) {
    return undefined;
  }
  return firstLine.length > 140 ? `${firstLine.slice(0, 137)}…` : firstLine;
}

/** A general announcement from the conservatory. */
export function announcement(data: Record<string, unknown>, locale: MailLocale): RenderedMail {
  const greek = locale !== 'en';
  const title = field(data, 'title');
  const body = field(data, 'body');
  const tenantName = field(data, 'tenantName');
  const authorName = field(data, 'authorName');

  const subject = title
    ? greek
      ? `Ανακοίνωση: ${title}`
      : `Announcement: ${title}`
    : greek
      ? 'Ανακοίνωση'
      : 'Announcement';

  const rows = buildRows([[greek ? 'Συντάκτης' : 'Author', authorName]]);

  const { html, text } = renderLayout({
    locale,
    preheader: preheaderFor(body),
    title: title ?? (greek ? 'Ανακοίνωση' : 'Announcement'),
    intro: body ?? (greek ? 'Δείτε την ανακοίνωση του ωδείου.' : 'Please see the announcement below.'),
    rows,
    footer: tenantName,
  });

  return { subject, html, text };
}
