import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import { ClsService } from 'nestjs-cls';
import { AuditService } from '../../common/audit.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import {
  MAILER,
  type MailLocale,
  type Mailer,
} from '../../infrastructure/mailer/mailer.types.js';
import { AuthService } from './auth.service.js';
import type {
  ConfirmPasswordResetDto,
  RequestPasswordResetDto,
} from './dto/password-reset.dto.js';

const DEFAULT_MAX_PER_HOUR = 3;
const DEFAULT_TTL_MINUTES = 30;
const DEFAULT_WEB_URL = 'http://localhost:4200';
const HOUR_MS = 3_600_000;

/**
 * Self-service password reset for locked-out users.
 *
 * The request endpoint is deliberately uninformative: it answers identically
 * for unknown, inactive and throttled accounts, and it spends the same argon2
 * time on all of them. Anything else would turn it into an account oracle.
 */
@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    @Inject(MAILER) private readonly mailer: Mailer,
    private readonly cls: ClsService,
  ) {}

  async request(dto: RequestPasswordResetDto, ip?: string): Promise<{ success: true }> {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user || user.status !== 'ACTIVE') {
      // Burn the same ~50 ms the happy path spends in argon2 so response time
      // does not reveal whether the address exists.
      await this.auth.hashPassword(randomBytes(32).toString('hex'));
      return { success: true };
    }

    const since = new Date(Date.now() - HOUR_MS);
    const recent = await this.prisma.passwordResetToken.count({
      where: { userId: user.id, createdAt: { gte: since } },
    });

    if (recent >= this.maxPerHour) {
      this.logger.warn(`Password reset hourly cap reached for user ${user.id}`);
      return { success: true };
    }

    const now = new Date();
    await this.prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: now },
    });

    const raw = randomBytes(32).toString('base64url');
    const ttlMinutes = this.ttlMinutes;

    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashToken(raw),
        expiresAt: new Date(now.getTime() + ttlMinutes * 60_000),
        requestedIp: ip ?? null,
      },
    });

    try {
      await this.mailer.send({
        to: user.email,
        template: 'password-reset',
        data: {
          resetUrl: `${this.webUrl}/reset-password?token=${raw}`,
          expiresInMinutes: ttlMinutes,
          userName: user.firstName,
        },
        locale: this.locale(user.locale),
      });
    } catch (error) {
      // A broken mail transport must not change the response shape or timing
      // profile of this endpoint.
      this.logger.error(`Password reset mail failed for user ${user.id}: ${String(error)}`);
    }

    await this.audit.record('user.password.reset_requested', 'User', user.id, { ip });
    return { success: true };
  }

  async validate(rawToken: string): Promise<{ valid: boolean }> {
    if (!rawToken) return { valid: false };

    const row = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: this.hashToken(rawToken) },
    });

    return { valid: !!row && !row.usedAt && row.expiresAt > new Date() };
  }

  async confirm(dto: ConfirmPasswordResetDto): Promise<{ success: true; message: string }> {
    const row = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: this.hashToken(dto.token) },
    });

    const now = new Date();
    if (!row || row.usedAt || row.expiresAt <= now) {
      throw new BadRequestException({
        code: 'INVALID_OR_EXPIRED_TOKEN',
        message: 'Ο σύνδεσμος επαναφοράς δεν είναι έγκυρος ή έχει λήξει',
      });
    }

    const passwordHash = await this.auth.hashPassword(dto.newPassword);

    await this.prisma.$transaction(async (tx) => {
      await tx.passwordResetToken.update({
        where: { id: row.id },
        data: { usedAt: now },
      });
      await tx.passwordResetToken.updateMany({
        where: { userId: row.userId, usedAt: null, id: { not: row.id } },
        data: { usedAt: now },
      });
      await tx.user.update({
        where: { id: row.userId },
        data: { passwordHash },
      });
    });

    await this.auth.revokeAllSessions(row.userId);
    await this.audit.record('user.password.reset', 'User', row.userId);
    this.logger.log(`Password reset completed for user ${row.userId}`);

    return { success: true, message: 'Ο κωδικός ενημερώθηκε. Συνδεθείτε ξανά.' };
  }

  private get maxPerHour(): number {
    const value = Number(this.config.get<string>('PASSWORD_RESET_MAX_PER_HOUR'));
    return Number.isFinite(value) && value > 0 ? value : DEFAULT_MAX_PER_HOUR;
  }

  private get ttlMinutes(): number {
    const value = Number(this.config.get<string>('PASSWORD_RESET_TTL_MINUTES'));
    return Number.isFinite(value) && value > 0 ? value : DEFAULT_TTL_MINUTES;
  }

  private get webUrl(): string {
    const value = this.config.get<string>('APP_PUBLIC_WEB_URL');
    return value && value.length > 0 ? value.replace(/\/+$/, '') : DEFAULT_WEB_URL;
  }

  private locale(value: string): MailLocale {
    return value === 'en' ? 'en' : 'el';
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
