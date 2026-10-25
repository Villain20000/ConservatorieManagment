import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PasswordResetService } from './password-reset.service.js';

const USER_ID = 'user-1';
const EMAIL = 'director@example.com';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

function activeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: USER_ID,
    email: EMAIL,
    firstName: 'Μαρία',
    lastName: 'Παπαδοπούλου',
    locale: 'el',
    status: 'ACTIVE',
    passwordHash: 'stored-hash',
    ...overrides,
  };
}

function createService(overrides: { maxPerHour?: number } = {}) {
  const prisma = {
    user: { findUnique: vi.fn(), update: vi.fn() },
    passwordResetToken: {
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback(prisma)),
  };
  const auth = {
    hashPassword: vi.fn(async (password: string) => `argon2:${password}`),
    revokeAllSessions: vi.fn().mockResolvedValue(undefined),
  };
  const values: Record<string, string> = {
    APP_PUBLIC_WEB_URL: 'https://musicos.example',
    PASSWORD_RESET_TTL_MINUTES: '30',
    PASSWORD_RESET_MAX_PER_HOUR: String(overrides.maxPerHour ?? 3),
  };
  const config = { get: vi.fn((key: string) => values[key]) };
  const audit = { record: vi.fn() };
  const mailer = { send: vi.fn() };
  const cls = { get: vi.fn() };

  const service = new PasswordResetService(
    prisma as any,
    auth as any,
    config as any,
    audit as any,
    mailer as any,
    cls as any,
  );

  return { service, prisma, auth, audit, mailer };
}

describe('PasswordResetService', () => {
  describe('request', () => {
    it('answers success and writes nothing for an unknown email', async () => {
      const { service, prisma, mailer } = createService();
      prisma.user.findUnique.mockResolvedValue(null);

      const result = await service.request({ email: '  Unknown@Example.com ' });

      expect(result).toEqual({ success: true });
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'unknown@example.com' },
      });
      expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(mailer.send).not.toHaveBeenCalled();
    });

    it('stores one hashed token and mails the raw one for an active account', async () => {
      const { service, prisma, mailer } = createService();
      prisma.user.findUnique.mockResolvedValue(activeUser());

      const result = await service.request({ email: EMAIL }, '10.0.0.7');

      expect(result).toEqual({ success: true });
      expect(prisma.passwordResetToken.create).toHaveBeenCalledTimes(1);
      expect(mailer.send).toHaveBeenCalledTimes(1);

      const message = mailer.send.mock.calls[0]![0] as {
        to: string;
        template: string;
        locale: string;
        data: { resetUrl: string; expiresInMinutes: number; userName: string };
      };

      expect(message.to).toBe(EMAIL);
      expect(message.template).toBe('password-reset');
      expect(message.locale).toBe('el');
      expect(message.data.expiresInMinutes).toBe(30);
      expect(message.data.resetUrl).toContain('https://musicos.example/reset-password?token=');

      const rawToken = new URL(message.data.resetUrl).searchParams.get('token');
      expect(rawToken).toBeTruthy();
      expect(message.data.resetUrl).toContain(rawToken!);

      const stored = prisma.passwordResetToken.create.mock.calls[0]![0] as {
        data: { userId: string; tokenHash: string; expiresAt: Date; requestedIp: string };
      };

      expect(stored.data.userId).toBe(USER_ID);
      expect(stored.data.tokenHash).toBe(sha256(rawToken!));
      expect(stored.data.tokenHash).not.toBe(rawToken);
      expect(stored.data.requestedIp).toBe('10.0.0.7');
      expect(stored.data.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('invalidates prior unused tokens when a new one is requested', async () => {
      const { service, prisma } = createService();
      prisma.user.findUnique.mockResolvedValue(activeUser());

      await service.request({ email: EMAIL });

      expect(prisma.passwordResetToken.updateMany).toHaveBeenCalledWith({
        where: { userId: USER_ID, usedAt: null },
        data: { usedAt: expect.any(Date) },
      });
    });

    it('returns success without mailing once the hourly cap is reached', async () => {
      const { service, prisma, mailer } = createService({ maxPerHour: 3 });
      prisma.user.findUnique.mockResolvedValue(activeUser());
      prisma.passwordResetToken.count.mockResolvedValue(3);

      const result = await service.request({ email: EMAIL });

      expect(result).toEqual({ success: true });
      expect(mailer.send).not.toHaveBeenCalled();
      expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
      expect(prisma.passwordResetToken.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('confirm', () => {
    const rawToken = 'a'.repeat(43);

    const storedToken = (overrides: Record<string, unknown> = {}) => ({
      id: 'token-1',
      userId: USER_ID,
      tokenHash: sha256(rawToken),
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: null,
      requestedIp: null,
      createdAt: new Date(),
      ...overrides,
    });

    it('rejects an expired token', async () => {
      const { service, prisma, auth } = createService();
      prisma.passwordResetToken.findUnique.mockResolvedValue(
        storedToken({ expiresAt: new Date(Date.now() - 60_000) }),
      );

      const error = await service
        .confirm({ token: rawToken, newPassword: 'new-password-1' })
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        code: 'INVALID_OR_EXPIRED_TOKEN',
      });
      expect(auth.revokeAllSessions).not.toHaveBeenCalled();
    });

    it('rejects a token that was already used', async () => {
      const { service, prisma, auth } = createService();
      prisma.passwordResetToken.findUnique.mockResolvedValue(
        storedToken({ usedAt: new Date() }),
      );

      const error = await service
        .confirm({ token: rawToken, newPassword: 'new-password-1' })
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        code: 'INVALID_OR_EXPIRED_TOKEN',
      });
      expect(auth.revokeAllSessions).not.toHaveBeenCalled();
    });

    it('consumes the token, stores a hash and kills every session', async () => {
      const { service, prisma, auth } = createService();
      prisma.passwordResetToken.findUnique.mockResolvedValue(storedToken());

      const result = await service.confirm({ token: rawToken, newPassword: 'new-password-1' });

      expect(result.success).toBe(true);
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.passwordResetToken.update).toHaveBeenCalledWith({
        where: { id: 'token-1' },
        data: { usedAt: expect.any(Date) },
      });
      expect(prisma.passwordResetToken.updateMany).toHaveBeenCalledWith({
        where: { userId: USER_ID, usedAt: null, id: { not: 'token-1' } },
        data: { usedAt: expect.any(Date) },
      });

      const update = prisma.user.update.mock.calls[0]![0] as {
        where: { id: string };
        data: { passwordHash: string };
      };

      expect(update.where).toEqual({ id: USER_ID });
      expect(update.data.passwordHash).not.toBe(rawToken);
      expect(update.data.passwordHash).not.toBe('new-password-1');
      expect(auth.hashPassword).toHaveBeenCalledWith('new-password-1');
      expect(auth.revokeAllSessions).toHaveBeenCalledTimes(1);
      expect(auth.revokeAllSessions).toHaveBeenCalledWith(USER_ID);
    });
  });
});
