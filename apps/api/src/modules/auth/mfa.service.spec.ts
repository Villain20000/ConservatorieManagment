import { UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { createHash } from 'node:crypto';
import { generate, generateSecret } from 'otplib';
import type { Response } from 'express';
import { MfaService } from './mfa.service.js';

const CONFIG: Record<string, string> = {
  MFA_ISSUER: 'MusicOS',
  MFA_ENFORCE_PRIVILEGED: 'false',
  MFA_WINDOW: '1',
};

const response = {} as Response;

interface UserState {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  locale: string;
  isPlatformAdmin: boolean;
  passwordHash: string;
  mfaSecret: string | null;
  mfaEnabledAt: Date | null;
  mfaLastUsedStep: number | null;
  mfaFailedAttempts: number;
  mfaLockedUntil: Date | null;
}

interface RecoveryRow {
  id: string;
  userId: string;
  codeHash: string;
  usedAt: Date | null;
  createdAt: Date;
}

/**
 * An in-memory Prisma stand-in: `user.update` merges into the row that
 * `user.findUnique` hands back, so failure counters, replay steps and lockouts
 * behave the way they would against a real database.
 */
function createHarness(overrides: Partial<UserState> = {}) {
  const state: { user: UserState } = {
    user: {
      id: 'user-1',
      email: 'director@odeio.gr',
      firstName: 'Νίκος',
      lastName: 'Παπαδόπουλος',
      locale: 'el',
      isPlatformAdmin: false,
      passwordHash: '',
      mfaSecret: null,
      mfaEnabledAt: null,
      mfaLastUsedStep: null,
      mfaFailedAttempts: 0,
      mfaLockedUntil: null,
      ...overrides,
    },
  };

  const recoveryRows: RecoveryRow[] = [];

  const prisma: any = {
    user: {
      findUnique: vi.fn(async () => ({ ...state.user })),
      findUniqueOrThrow: vi.fn(async () => ({ ...state.user })),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(state.user, data);
        return { ...state.user };
      }),
    },
    mfaRecoveryCode: {
      create: vi.fn(async ({ data }: { data: { userId: string; codeHash: string } }) => {
        const row: RecoveryRow = {
          id: `recovery-${recoveryRows.length + 1}`,
          usedAt: null,
          createdAt: new Date(),
          ...data,
        };
        recoveryRows.push(row);
        return row;
      }),
      deleteMany: vi.fn(async () => {
        const count = recoveryRows.length;
        recoveryRows.length = 0;
        return { count };
      }),
      findFirst: vi.fn(
        async ({ where }: { where: { userId: string; codeHash: string; usedAt: null } }) =>
          recoveryRows.find(
            (row) =>
              row.userId === where.userId &&
              row.codeHash === where.codeHash &&
              row.usedAt === null,
          ) ?? null,
      ),
      updateMany: vi.fn(
        async ({ where, data }: { where: { id: string; usedAt: null }; data: { usedAt: Date } }) => {
          const row = recoveryRows.find((candidate) => candidate.id === where.id && !candidate.usedAt);
          if (!row) {
            return { count: 0 };
          }
          Object.assign(row, data);
          return { count: 1 };
        },
      ),
      count: vi.fn(
        async ({ where }: { where: { userId: string; usedAt: null } }) =>
          recoveryRows.filter((row) => row.userId === where.userId && row.usedAt === null).length,
      ),
    },
  };
  prisma.$transaction = vi.fn(async (arg: unknown) =>
    Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: unknown) => Promise<unknown>)(prisma),
  );

  const auth = {
    issueSessionForUser: vi.fn(async () => ({
      accessToken: 'access-token',
      user: { id: state.user.id },
    })),
    revokeAllSessions: vi.fn(async () => undefined),
  };
  const config = {
    get: vi.fn((key: string) => CONFIG[key]),
  };
  const ctx = {
    userId: state.user.id,
    user: {
      userId: state.user.id,
      email: state.user.email,
      isPlatformAdmin: state.user.isPlatformAdmin,
      role: 'DIRECTOR',
      permissions: [],
    },
  };
  const audit = { record: vi.fn(async () => undefined) };
  const mailer = { send: vi.fn(async () => undefined) };
  const jwt = { verifyAsync: vi.fn(async () => ({ sub: state.user.id, typ: 'mfa' })) };

  const service = new MfaService(
    prisma as any,
    auth as any,
    config as any,
    ctx as any,
    audit as any,
    mailer as any,
    jwt as any,
  );

  return { service, prisma, auth, config, ctx, audit, mailer, jwt, state, recoveryRows };
}

/** A code that is definitely not the current TOTP for this secret. */
async function wrongCode(secret: string): Promise<string> {
  const current = Number(await generate({ secret }));
  return String((current + 1) % 1_000_000).padStart(6, '0');
}

describe('MfaService.verifyChallenge', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('accepts a valid TOTP code inside the ±1 step window', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-01T12:00:15.000Z'));

    const secret = generateSecret();
    const { service, auth, state } = createHarness({
      mfaSecret: secret,
      mfaEnabledAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    const now = Math.floor(Date.now() / 1000);
    // Emitted one step early: only a windowed verification can accept it.
    const code = await generate({ secret, epoch: now - 30 });

    const session = await service.verifyChallenge({ challengeToken: 'challenge', code }, response);

    expect(session).toEqual({ accessToken: 'access-token', user: { id: 'user-1' } });
    expect(auth.issueSessionForUser).toHaveBeenCalledWith('user-1', response, undefined);
    expect(state.user.mfaLastUsedStep).toBe(Math.floor((now - 30) / 30));
    expect(state.user.mfaFailedAttempts).toBe(0);
  });

  it('rejects replaying a code from an already spent time step', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-01T12:00:15.000Z'));

    const secret = generateSecret();
    const { service, auth, state } = createHarness({
      mfaSecret: secret,
      mfaEnabledAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    const now = Math.floor(Date.now() / 1000);
    const code = await generate({ secret, epoch: now });

    await service.verifyChallenge({ challengeToken: 'challenge', code }, response);
    expect(state.user.mfaLastUsedStep).toBe(Math.floor(now / 30));

    await expect(
      service.verifyChallenge({ challengeToken: 'challenge', code }, response),
    ).rejects.toMatchObject({ status: 401, response: { code: 'MFA_CODE_INVALID' } });

    expect(auth.issueSessionForUser).toHaveBeenCalledTimes(1);
  });

  it('accepts a recovery code once and rejects the same code afterwards', async () => {
    const secret = generateSecret();
    const { service, auth, recoveryRows } = createHarness({ mfaSecret: secret });
    const { recoveryCodes } = await service.activate({ code: await generate({ secret }) });
    const recoveryCode = recoveryCodes[0]!;

    await expect(
      service.verifyChallenge({ challengeToken: 'challenge', code: recoveryCode }, response),
    ).resolves.toEqual({ accessToken: 'access-token', user: { id: 'user-1' } });
    expect(recoveryRows.filter((row) => row.usedAt !== null)).toHaveLength(1);

    await expect(
      service.verifyChallenge({ challengeToken: 'challenge', code: recoveryCode }, response),
    ).rejects.toMatchObject({ status: 401, response: { code: 'MFA_CODE_INVALID' } });

    expect(auth.issueSessionForUser).toHaveBeenCalledTimes(1);
  });

  it('locks the account after five consecutive failures', async () => {
    const secret = generateSecret();
    const { service, state } = createHarness({
      mfaSecret: secret,
      mfaEnabledAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    const bad = await wrongCode(secret);

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await expect(
        service.verifyChallenge({ challengeToken: 'challenge', code: bad }, response),
      ).rejects.toMatchObject({ status: 401, response: { code: 'MFA_CODE_INVALID' } });
      expect(state.user.mfaFailedAttempts).toBe(attempt);
    }

    expect(state.user.mfaLockedUntil).toBeInstanceOf(Date);
    expect(state.user.mfaLockedUntil!.getTime()).toBeGreaterThan(Date.now() + 14 * 60_000);
  });

  it('returns 429 MFA_LOCKED while the lockout is active, even for a correct code', async () => {
    const secret = generateSecret();
    const { service, state } = createHarness({
      mfaSecret: secret,
      mfaEnabledAt: new Date('2026-01-01T00:00:00.000Z'),
      mfaFailedAttempts: 5,
      mfaLockedUntil: new Date(Date.now() + 10 * 60_000),
    });

    await expect(
      service.verifyChallenge(
        { challengeToken: 'challenge', code: await generate({ secret }) },
        response,
      ),
    ).rejects.toMatchObject({ status: 429, response: { code: 'MFA_LOCKED' } });

    expect(state.user.mfaLastUsedStep).toBeNull();
  });

  it('rejects a challenge token that is not an MFA token', async () => {
    const secret = generateSecret();
    const { service, auth, jwt } = createHarness({
      mfaSecret: secret,
      mfaEnabledAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    jwt.verifyAsync.mockResolvedValue({ sub: 'user-1', typ: 'access' } as never);

    const failure = service.verifyChallenge(
      { challengeToken: 'not-an-mfa-token', code: await generate({ secret }) },
      response,
    );

    await expect(failure).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(failure).rejects.toMatchObject({
      status: 401,
      response: { code: 'MFA_CHALLENGE_EXPIRED' },
    });
    expect(auth.issueSessionForUser).not.toHaveBeenCalled();
  });
});

describe('MfaService.activate', () => {
  it('stores recovery codes hashed and returns the plaintext exactly once', async () => {
    const secret = generateSecret();
    const { service, recoveryRows } = createHarness({ mfaSecret: secret });

    const { recoveryCodes } = await service.activate({ code: await generate({ secret }) });

    expect(recoveryCodes).toHaveLength(10);
    for (const code of recoveryCodes) {
      expect(code).toMatch(/^[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/);
    }

    const storedHashes = recoveryRows.map((row) => row.codeHash);
    expect(storedHashes).toHaveLength(10);

    for (const code of recoveryCodes) {
      expect(storedHashes).not.toContain(code);
    }

    expect(storedHashes.sort()).toEqual(
      recoveryCodes.map((code) => createHash('sha256').update(code).digest('hex')).sort(),
    );
  });

  it('refuses to activate without a pending secret', async () => {
    const { service } = createHarness();

    await expect(service.activate({ code: '123456' })).rejects.toMatchObject({
      status: 400,
      response: { code: 'MFA_NOT_STARTED' },
    });
  });
});

describe('MfaService.disable', () => {
  it('requires the password and a valid code', async () => {
    const secret = generateSecret();
    const passwordHash = await argon2.hash('S3cret-Pass', { type: argon2.argon2id });
    const { service, auth, audit, mailer, recoveryRows, state } = createHarness({
      mfaSecret: secret,
      mfaEnabledAt: new Date('2026-01-01T00:00:00.000Z'),
      passwordHash,
    });

    const code = await generate({ secret });

    await expect(service.disable({ password: 'wrong-password', code })).rejects.toMatchObject({
      status: 401,
      response: { code: 'MFA_PASSWORD_INVALID' },
    });
    expect(state.user.mfaEnabledAt).not.toBeNull();

    await expect(service.disable({ password: 'S3cret-Pass', code })).resolves.toEqual({
      success: true,
    });

    expect(state.user.mfaSecret).toBeNull();
    expect(state.user.mfaEnabledAt).toBeNull();
    expect(state.user.mfaLastUsedStep).toBeNull();
    expect(recoveryRows).toHaveLength(0);
    expect(auth.revokeAllSessions).toHaveBeenCalledWith('user-1');
    expect(mailer.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'director@odeio.gr',
        template: 'mfa-changed',
        data: expect.objectContaining({ action: 'disabled' }),
        locale: 'el',
      }),
    );
    expect(audit.record).toHaveBeenCalledWith('user.mfa.disabled', 'User', 'user-1');
  });

  it('refuses to disable when the policy enforces MFA for the role', async () => {
    const secret = generateSecret();
    const { service, config } = createHarness({
      mfaSecret: secret,
      mfaEnabledAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    config.get.mockImplementation((key: string) =>
      key === 'MFA_ENFORCE_PRIVILEGED' ? 'true' : CONFIG[key],
    );

    await expect(
      service.disable({ password: 'whatever', code: await generate({ secret }) }),
    ).rejects.toMatchObject({ status: 403, response: { code: 'MFA_ENFORCED_CANNOT_DISABLE' } });
  });
});
