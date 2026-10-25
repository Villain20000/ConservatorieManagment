import { describe, expect, it } from 'vitest';
import { MailDeliveryError } from '../mailer.types.js';
import type { MailLocale, MailTemplateKey } from '../mailer.types.js';
import { renderTemplate, TEMPLATES } from './index.js';

const LOCALES: readonly MailLocale[] = ['el', 'en'];

const KEYS = Object.keys(TEMPLATES) as MailTemplateKey[];

const SAMPLE_DATA: Record<MailTemplateKey, Record<string, unknown>> = {
  receipt: {
    studentName: 'Μαρία Παπαδοπούλου',
    amount: '€120.00',
    receiptNumber: 'ΑΠ-2026-0042',
    paidAt: '12/03/2026',
    method: 'Κάρτα',
    tenantName: 'Ωδείο Αθηνών',
  },
  'overdue-reminder': {
    studentName: 'Νίκος Αντωνίου',
    amount: '€80.00',
    dueDate: '01/03/2026',
    tenantName: 'Ωδείο Αθηνών',
    daysOverdue: 14,
  },
  'exam-published': {
    studentName: 'Ελένη Δημητρίου',
    programName: 'Πιάνο — Ανώτερη τάξη',
    examDate: '20/06/2026',
    grade: 'Άριστα',
    outcome: 'pass',
    tenantName: 'Ωδείο Αθηνών',
  },
  'document-issued': {
    studentName: 'Γιώργος Παππάς',
    documentTitle: 'Βεβαίωση σπουδών',
    protocolNumber: 'ΠΡΩΤ/2026/118',
    issuedAt: '02/04/2026',
    tenantName: 'Ωδείο Αθηνών',
  },
  announcement: {
    title: 'Έναρξη εγγραφών χειμερινού εξαμήνου',
    body: 'Οι εγγραφές ξεκινούν τη Δευτέρα 1 Σεπτεμβρίου.\n\nΗ γραμματεία λειτουργεί καθημερινά 10:00–18:00.',
    tenantName: 'Ωδείο Αθηνών',
    authorName: 'Η Γραμματεία',
  },
  'password-reset': {
    resetUrl: 'https://example.test/reset?token=abc123',
    expiresInMinutes: 60,
    userName: 'm.papadopoulou',
  },
  'mfa-changed': {
    action: 'recovery-codes-regenerated',
    userName: 'm.papadopoulou',
    occurredAt: '12/03/2026 18:42',
  },
};

function captureError(run: () => unknown): MailDeliveryError {
  try {
    run();
  } catch (error) {
    return error as MailDeliveryError;
  }
  throw new Error('expected the call to throw, but it returned normally');
}

describe('mail templates', () => {
  it('registers a renderer for every template key', () => {
    expect(KEYS).toHaveLength(7);
    for (const key of KEYS) {
      expect(typeof TEMPLATES[key]).toBe('function');
    }
  });

  it.each(KEYS)('%s renders in Greek and English without leaking placeholders', (key) => {
    for (const locale of LOCALES) {
      const rendered = renderTemplate(key, SAMPLE_DATA[key], locale);

      expect(rendered.subject.length).toBeGreaterThan(0);
      expect(rendered.html).toContain('<!doctype html>');
      expect(rendered.text.length).toBeGreaterThan(0);

      for (const output of [rendered.subject, rendered.html, rendered.text]) {
        expect(output).not.toContain('undefined');
        expect(output).not.toContain('[object Object]');
      }
    }
  });

  it.each(KEYS)('%s uses a distinct subject per locale', (key) => {
    const greek = renderTemplate(key, SAMPLE_DATA[key], 'el');
    const english = renderTemplate(key, SAMPLE_DATA[key], 'en');

    expect(greek.subject).not.toBe(english.subject);
  });

  it('sets the document language from the locale', () => {
    expect(renderTemplate('receipt', SAMPLE_DATA.receipt, 'el').html).toContain('lang="el"');
    expect(renderTemplate('receipt', SAMPLE_DATA.receipt, 'en').html).toContain('lang="en"');
  });

  it('mirrors the receipt in the plain-text body', () => {
    const rendered = renderTemplate('receipt', SAMPLE_DATA.receipt, 'el');

    expect(rendered.text).toContain('Απόδειξη πληρωμής');
    expect(rendered.text).toContain('Ποσό: €120.00');
    expect(rendered.text).toContain('Αριθμός απόδειξης: ΑΠ-2026-0042');
  });

  it('escapes announcement markup in html but keeps it literal in text', () => {
    const payload = '<script>alert(1)</script>';
    const rendered = renderTemplate(
      'announcement',
      { title: 'Ανακοίνωση', body: payload, tenantName: 'Ωδείο Αθηνών' },
      'el',
    );

    expect(rendered.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(rendered.html).not.toContain('<script>');
    expect(rendered.text).toContain(payload);
  });

  it('reports an unknown template as a non-retryable delivery error', () => {
    const error = captureError(() => renderTemplate('nope' as MailTemplateKey, {}, 'el'));

    expect(error).toBeInstanceOf(MailDeliveryError);
    expect(error.code).toBe('TEMPLATE_MISSING');
    expect(error.retryable).toBe(false);
  });

  it('renders a receipt with completely empty data', () => {
    const rendered = renderTemplate('receipt', {}, 'el');

    expect(rendered.subject).toBe('Η απόδειξή σας');
    expect(rendered.html).toContain('—');
    expect(rendered.html).not.toContain('undefined');
    expect(rendered.text).toContain('Σπουδαστής/Σπουδάστρια: —');
  });
});
