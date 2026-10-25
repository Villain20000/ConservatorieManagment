import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { createHash, randomInt } from 'node:crypto';
import type { Response } from 'express';
import { generateSecret, verify as verifyOtp } from 'otplib';
import QRCode from 'qrcode';
import { AuditService } from '../../common/audit.service.js';
import { TenantContextService } from '../../common/tenant-context.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import {
  MAILER,
  type MailMessage,
  type Mailer,
} from '../../infrastructure/mailer/mailer.types.js';
import { AuthService, type SessionResult } from './auth.service.js';
import type {
  ActivateMfaDto,
  DisableMfaDto,
  RegenerateRecoveryCodesDto,
  VerifyMfaDto,
} from './dto/mfa.dto.js';

const TOTP_PERIOD_SECONDS = 30;
const TOTP_DIGITS = 6;
const RECOVERY_CODE_COUNT = 10;
const RECOVERY_CODE_LENGTH = 8;
/** No `0`/`O`/`1`/`I`: these get read aloud over the phone and typed by hand. */
const RECOVERY_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60_000;

export interface MfaStatus {
  enabled: boolean;
  enforced: boolean;
  enrolledAt: string | null;
  recoveryCodesRemaining: number;
}

export interface MfaEnrolment {
  secret: string;
  otpauthUri: string;
  qrDataUrl: string;
}

type MfaAction = 'enabled' | 'disabled' | 'recovery-codes-regenerated';

/** The subset of the `User` row this service reads. */
interface MfaUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  locale: string;
  passwordHash: string;
  mfaSecret: string | null;
  mfaEnabledAt: Date | null;
  mfaLastUsedStep: number | null;
  mfaFailedAttempts: number;
  mfaLockedUntil: Date | null;
}

@Injectable()
export class MfaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly config: ConfigService,
    private readonly ctx: TenantContextService,
    private readonly audit: AuditService,
    @Inject(MAILER) private readonly mailer: Mailer,
    private readonly jwt: JwtService,
  ) {}

  async status(): Promise<MfaStatus> {
    const userId = this.ctx.userId;
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { mfaEnabledAt: true },
    });
    const recoveryCodesRemaining = await this.prisma.mfaRecoveryCode.count({
      where: { userId, usedAt: null },
    });

    return {
      enabled: user.mfaEnabledAt !== null,
      enforced: this.isEnforced(),
      enrolledAt: user.mfaEnabledAt ? user.mfaEnabledAt.toISOString() : null,
      recoveryCodesRemaining,
    };
  }

  async beginEnrolment(): Promise<MfaEnrolment> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: this.ctx.userId } });

    if (user.mfaEnabledAt) {
      throw new ConflictException({
        code: 'MFA_ALREADY_ENABLED',
        message: 'Ο έλεγχος ταυτότητας δύο παραγόντων είναι ήδη ενεργός',
      });
    }

    const secret = generateSecret();
    await this.prisma.user.update({
      where: { id: user.id },
      data: { mfaSecret: secret },
    });

    const issuer = this.config.get<string>('MFA_ISSUER') ?? 'MusicOS';
    const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(user.email)}`;
    const otpauthUri =
      `otpauth://totp/${label}` +
      `?secret=${encodeURIComponent(secret)}` +
      `&issuer=${encodeURIComponent(issuer)}` +
      `&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_PERIOD_SECONDS}`;

    const qrDataUrl = await QRCode.toDataURL(otpauthUri, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 256,
    });

    return { secret, otpauthUri, qrDataUrl };
  }

  async activate(dto: ActivateMfaDto): Promise<{ recoveryCodes: string[] }> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: this.ctx.userId } });

    if (!user.mfaSecret) {
      throw new BadRequestException({
        code: 'MFA_NOT_STARTED',
        message: 'Δεν υπάρχει εκκρεμής εγγραφή ελέγχου ταυτότητας δύο παραγόντων',
      });
    }

    if (user.mfaEnabledAt) {
      throw new ConflictException({
        code: 'MFA_ALREADY_ENABLED',
        message: 'Ο έλεγχος ταυτότητας δύο παραγόντων είναι ήδη ενεργός',
      });
    }

    const step = await this.verifyTotpStep(user.mfaSecret, dto.code.trim(), null);
    if (step === null) {
      throw this.codeInvalid();
    }

    const recoveryCodes = this.generateRecoveryCodes();
    const now = new Date();

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: {
          mfaEnabledAt: now,
          mfaLastUsedStep: step,
          mfaFailedAttempts: 0,
          mfaLockedUntil: null,
        },
      }),
      this.prisma.mfaRecoveryCode.deleteMany({ where: { userId: user.id } }),
      ...recoveryCodes.map(({ hash }) =>
        this.prisma.mfaRecoveryCode.create({ data: { userId: user.id, codeHash: hash } }),
      ),
    ]);

    await this.auth.revokeAllSessions(user.id);
    await this.sendChangedEmail(user, 'enabled');
    await this.audit.record('user.mfa.enabled', 'User', user.id);

    // Plaintext recovery codes exist only in this response.
    return { recoveryCodes: recoveryCodes.map(({ plain }) => plain) };
  }

  async verifyChallenge(
    dto: VerifyMfaDto,
    response: Response,
    userAgent?: string,
  ): Promise<SessionResult> {
    const userId = await this.readChallengeSubject(dto.challengeToken);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user || !user.mfaEnabledAt || !user.mfaSecret) {
      throw this.challengeExpired();
    }

    const now = new Date();
    if (user.mfaLockedUntil && user.mfaLockedUntil > now) {
      throw new HttpException(
        {
          code: 'MFA_LOCKED',
          message: 'Πολλές αποτυχημένες προσπάθειες. Δοκιμάστε ξανά αργότερα',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const accepted = await this.consumeCode(user, dto.code.trim());
    if (accepted === null) {
      await this.registerFailure(user, now);
      throw this.codeInvalid();
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        mfaFailedAttempts: 0,
        mfaLockedUntil: null,
        ...(accepted.step === null ? {} : { mfaLastUsedStep: accepted.step }),
      },
    });

    return this.auth.issueSessionForUser(user.id, response, userAgent);
  }

  async disable(dto: DisableMfaDto): Promise<{ success: true }> {
    const current = await this.status();
    if (current.enforced) {
      throw new ForbiddenException({
        code: 'MFA_ENFORCED_CANNOT_DISABLE',
        message: 'Ο έλεγχος ταυτότητας δύο παραγόντων είναι υποχρεωτικός για τον ρόλο σας',
      });
    }

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: this.ctx.userId } });

    if (!user.mfaEnabledAt || !user.mfaSecret) {
      throw new BadRequestException({
        code: 'MFA_NOT_ENABLED',
        message: 'Ο έλεγχος ταυτότητας δύο παραγόντων δεν είναι ενεργός',
      });
    }

    const passwordValid = await argon2.verify(user.passwordHash, dto.password);
    if (!passwordValid) {
      throw new UnauthorizedException({
        code: 'MFA_PASSWORD_INVALID',
        message: 'Ο κωδικός πρόσβασης δεν είναι σωστός',
      });
    }

    const accepted = await this.consumeCode(user, dto.code.trim());
    if (accepted === null) {
      throw this.codeInvalid();
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: {
          mfaSecret: null,
          mfaEnabledAt: null,
          mfaLastUsedStep: null,
          mfaFailedAttempts: 0,
          mfaLockedUntil: null,
        },
      }),
      this.prisma.mfaRecoveryCode.deleteMany({ where: { userId: user.id } }),
    ]);

    await this.auth.revokeAllSessions(user.id);
    await this.sendChangedEmail(user, 'disabled');
    await this.audit.record('user.mfa.disabled', 'User', user.id);

    return { success: true };
  }

  async regenerateRecoveryCodes(
    dto: RegenerateRecoveryCodesDto,
  ): Promise<{ recoveryCodes: string[] }> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: this.ctx.userId } });

    if (!user.mfaEnabledAt) {
      throw new BadRequestException({
        code: 'MFA_NOT_ENABLED',
        message: 'Ο έλεγχος ταυτότητας δύο παραγόντων δεν είναι ενεργός',
      });
    }

    const passwordValid = await argon2.verify(user.passwordHash, dto.password);
    if (!passwordValid) {
      throw new UnauthorizedException({
        code: 'MFA_PASSWORD_INVALID',
        message: 'Ο κωδικός πρόσβασης δεν είναι σωστός',
      });
    }

    const recoveryCodes = this.generateRecoveryCodes();

    await this.prisma.$transaction([
      this.prisma.mfaRecoveryCode.deleteMany({ where: { userId: user.id } }),
      ...recoveryCodes.map(({ hash }) =>
        this.prisma.mfaRecoveryCode.create({ data: { userId: user.id, codeHash: hash } }),
      ),
    ]);

    await this.sendChangedEmail(user, 'recovery-codes-regenerated');
    await this.audit.record('user.mfa.recovery-codes-regenerated', 'User', user.id);

    return { recoveryCodes: recoveryCodes.map(({ plain }) => plain) };
  }

  /**
   * Accepts a TOTP token or a recovery code. Returns `null` when neither
   * matched, otherwise the TOTP step to remember (null for a recovery code,
   * which carries no time information).
   */
  private async consumeCode(
    user: Pick<MfaUser, 'id' | 'mfaSecret' | 'mfaLastUsedStep'>,
    code: string,
  ): Promise<{ step: number | null } | null> {
    const isRecoveryCode = code.includes('-') || code.length > TOTP_DIGITS;

    if (isRecoveryCode) {
      const consumed = await this.consumeRecoveryCode(user.id, code);
      return consumed ? { step: null } : null;
    }

    if (!user.mfaSecret) {
      return null;
    }

    const step = await this.verifyTotpStep(user.mfaSecret, code, user.mfaLastUsedStep);
    return step === null ? null : { step };
  }

  /**
   * Verifies a TOTP token inside the configured window and returns the step it
   * matched. Returns `null` for an invalid token, a malformed token, or a
   * replay of a step that has already been spent.
   */
  private async verifyTotpStep(
    secret: string,
    code: string,
    lastUsedStep: number | null,
  ): Promise<number | null> {
    let result: Awaited<ReturnType<typeof verifyOtp>>;
    try {
      result = await verifyOtp({
        secret,
        token: code,
        digits: TOTP_DIGITS,
        period: TOTP_PERIOD_SECONDS,
        epochTolerance: this.windowSteps * TOTP_PERIOD_SECONDS,
      });
    } catch {
      // Malformed input (non-digits) throws rather than returning invalid.
      return null;
    }

    if (!result.valid) {
      return null;
    }

    // `otplib`'s functional API returns a TOTP/HOTP union; only TOTP carries the
    // step, and only the step can tell us whether this code was already spent.
    if (!('timeStep' in result)) {
      return null;
    }

    if (lastUsedStep !== null && result.timeStep <= lastUsedStep) {
      return null;
    }

    return result.timeStep;
  }

  /** Marks a recovery code used. The conditional update makes the claim atomic. */
  private async consumeRecoveryCode(userId: string, code: string): Promise<boolean> {
    const codeHash = this.hashRecoveryCode(code);
    const row = await this.prisma.mfaRecoveryCode.findFirst({
      where: { userId, codeHash, usedAt: null },
    });

    if (!row) {
      return false;
    }

    const claimed = await this.prisma.mfaRecoveryCode.updateMany({
      where: { id: row.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    return claimed.count === 1;
  }

  private async registerFailure(
    user: Pick<MfaUser, 'id' | 'mfaFailedAttempts' | 'mfaLockedUntil'>,
    now: Date,
  ): Promise<void> {
    // An expired lockout starts a fresh streak instead of re-locking instantly.
    const expired = user.mfaLockedUntil !== null && user.mfaLockedUntil <= now;
    const attempts = (expired ? 0 : user.mfaFailedAttempts) + 1;

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        mfaFailedAttempts: attempts,
        ...(attempts >= MAX_FAILED_ATTEMPTS
          ? { mfaLockedUntil: new Date(now.getTime() + LOCKOUT_MS) }
          : {}),
      },
    });
  }

  private async readChallengeSubject(token: string): Promise<string> {
    let payload: { sub?: string; typ?: string } | undefined;

    try {
      payload = await this.jwt.verifyAsync<{ sub?: string; typ?: string }>(token);
    } catch {
      throw this.challengeExpired();
    }

    if (!payload || payload.typ !== 'mfa' || typeof payload.sub !== 'string' || !payload.sub) {
      throw this.challengeExpired();
    }

    return payload.sub;
  }

  private generateRecoveryCodes(): Array<{ plain: string; hash: string }> {
    return Array.from({ length: RECOVERY_CODE_COUNT }, () => {
      let raw = '';
      for (let index = 0; index < RECOVERY_CODE_LENGTH; index += 1) {
        raw += RECOVERY_ALPHABET[randomInt(RECOVERY_ALPHABET.length)];
      }
      const plain = `${raw.slice(0, 4)}-${raw.slice(4)}`;
      return { plain, hash: this.hashRecoveryCode(plain) };
    });
  }

  private hashRecoveryCode(code: string): string {
    return createHash('sha256').update(code.trim().toUpperCase()).digest('hex');
  }

  private async sendChangedEmail(
    user: Pick<MfaUser, 'email' | 'firstName' | 'lastName' | 'locale'>,
    action: MfaAction,
  ): Promise<void> {
    const message: MailMessage = {
      to: user.email,
      template: 'mfa-changed',
      data: {
        action,
        userName: `${user.firstName} ${user.lastName}`.trim(),
        occurredAt: new Date().toISOString(),
      },
      locale: user.locale === 'en' ? 'en' : 'el',
    };

    await this.mailer.send(message);
  }

  private get windowSteps(): number {
    const configured = Number(this.config.get<string>('MFA_WINDOW') ?? 1);
    return Number.isInteger(configured) && configured >= 0 ? configured : 1;
  }

  private isPrivileged(): boolean {
    const user = this.ctx.user;
    return (
      user.isPlatformAdmin === true || user.role === 'DIRECTOR' || user.role === 'ADMINISTRATOR'
    );
  }

  private isEnforced(): boolean {
    return this.config.get<string>('MFA_ENFORCE_PRIVILEGED') === 'true' && this.isPrivileged();
  }

  private challengeExpired(): UnauthorizedException {
    return new UnauthorizedException({
      code: 'MFA_CHALLENGE_EXPIRED',
      message: 'Η επαλήθευση δύο παραγόντων έληξε. Συνδεθείτε ξανά',
    });
  }

  private codeInvalid(): UnauthorizedException {
    return new UnauthorizedException({
      code: 'MFA_CODE_INVALID',
      message: 'Ο κωδικός επαλήθευσης δεν είναι έγκυρος',
    });
  }
}
