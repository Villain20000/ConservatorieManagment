import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';
import { LogMailer } from './log.mailer.js';
import type { Mailer } from './mailer.types.js';
import { SmtpMailer } from './smtp.mailer.js';

const DEFAULT_FROM = 'MusicOS <no-reply@musicos.local>';
const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Chooses the mail transport at boot.
 *
 * Without `SMTP_URL` there is nowhere to deliver to, so the log mailer is used
 * and the operator is told once, here, instead of being spammed on every send.
 */
export function createMailer(config: ConfigService): Mailer {
  const logger = new Logger(createMailer.name);
  const smtpUrl = config.get<string>('SMTP_URL')?.trim();

  if (!smtpUrl) {
    logger.warn('SMTP_URL is not set — outgoing mail is logged, not delivered');
    return new LogMailer(config);
  }

  const timeout = readTimeout(config.get<string>('SMTP_CONNECTION_TIMEOUT_MS'));
  const transporter = nodemailer.createTransport({
    url: smtpUrl,
    connectionTimeout: timeout,
    greetingTimeout: timeout,
    socketTimeout: timeout,
  });

  return new SmtpMailer(
    transporter,
    config.get<string>('SMTP_FROM')?.trim() || DEFAULT_FROM,
    config.get<string>('SMTP_REPLY_TO')?.trim() || undefined,
  );
}

function readTimeout(raw: string | undefined): number {
  const parsed = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}
