import type { Transporter } from 'nodemailer';
import { MailDeliveryError } from './mailer.types.js';
import { SmtpMailer } from './smtp.mailer.js';

const { renderTemplate } = vi.hoisted(() => ({ renderTemplate: vi.fn() }));

vi.mock('./templates/index.js', () => ({ renderTemplate }));

const FROM = 'MusicOS <no-reply@musicos.local>';

function createTransporter(): { transporter: Transporter; sendMail: ReturnType<typeof vi.fn> } {
  const sendMail = vi.fn().mockResolvedValue({ messageId: '<test@musicos.local>' });
  return { transporter: { sendMail } as unknown as Transporter, sendMail };
}

function smtpError(properties: Record<string, unknown>): Error {
  return Object.assign(new Error('smtp failure'), properties);
}

describe('SmtpMailer', () => {
  beforeEach(() => {
    renderTemplate.mockReset();
  });

  describe('error classification', () => {
    it.each([
      ['EAUTH', { code: 'EAUTH' }, false],
      ['EENVELOPE', { code: 'EENVELOPE' }, false],
      ['responseCode 550', { responseCode: 550 }, false],
      ['ECONNECTION', { code: 'ECONNECTION' }, true],
      ['ETIMEDOUT', { code: 'ETIMEDOUT' }, true],
      ['responseCode 421', { responseCode: 421 }, true],
      ['an unknown error', { code: 'EWEIRD' }, true],
    ])('classifies %s', async (_label, properties, retryable) => {
      const { transporter, sendMail } = createTransporter();
      sendMail.mockRejectedValue(smtpError(properties));
      const mailer = new SmtpMailer(transporter, FROM);

      const failure = await mailer
        .send({ to: 'parent@example.com', subject: 'Receipt', text: 'body' })
        .catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(MailDeliveryError);
      expect((failure as MailDeliveryError).retryable).toBe(retryable);
    });
  });

  it('renders a templated message and sends both html and text', async () => {
    renderTemplate.mockReturnValue({
      subject: 'Απόδειξη REC-1',
      html: '<p>Απόδειξη</p>',
      text: 'Απόδειξη',
    });
    const { transporter, sendMail } = createTransporter();
    const mailer = new SmtpMailer(transporter, FROM, 'office@musicos.local');

    await mailer.send({
      to: 'parent@example.com',
      template: 'receipt',
      data: { number: 'REC-1' },
      locale: 'el',
    });

    expect(renderTemplate).toHaveBeenCalledWith('receipt', { number: 'REC-1' }, 'el');
    expect(sendMail).toHaveBeenCalledWith({
      from: FROM,
      to: 'parent@example.com',
      replyTo: 'office@musicos.local',
      subject: 'Απόδειξη REC-1',
      html: '<p>Απόδειξη</p>',
      text: 'Απόδειξη',
    });
  });

  it('rejects a message with neither template nor subject without touching the transport', async () => {
    const { transporter, sendMail } = createTransporter();
    const mailer = new SmtpMailer(transporter, FROM);

    const failure = await mailer
      .send({ to: 'parent@example.com', text: 'body' })
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(MailDeliveryError);
    expect((failure as MailDeliveryError).retryable).toBe(false);
    expect(sendMail).not.toHaveBeenCalled();
  });
});
