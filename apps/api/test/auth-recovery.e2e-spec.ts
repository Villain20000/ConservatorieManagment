import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { MAILER } from '../src/infrastructure/mailer/mailer.types.js';
import type { MailMessage } from '../src/infrastructure/mailer/mailer.types.js';

const INITIAL_PASSWORD = 'InitialPass123!';
const NEW_PASSWORD = 'RotatedPass456!';

/**
 * The reset endpoint is throttled to 5 requests per 15 minutes per address, and
 * every supertest call shares one address. This spec therefore budgets its
 * requests deliberately: five across the functional cases, then one more to
 * assert the throttle itself.
 */
const IP_THROTTLE_LIMIT = 5;

/**
 * A capturing mailer: the reset token is only ever stored as a SHA-256 hash, so
 * the only way to prove the emailed link actually works is to read it out of the
 * message. This also proves the email contains a usable URL.
 */
function createCapturingMailer() {
  const sent: MailMessage[] = [];
  return {
    sent,
    reset() {
      sent.length = 0;
    },
    async send(message: MailMessage) {
      sent.push(message);
    },
  };
}

describe('Password recovery (e2e)', () => {
  let app: INestApplication;
  let server: Parameters<typeof request>[0];
  let prisma: PrismaService;
  let userId: string;
  const mailer = createCapturingMailer();

  beforeAll(async () => {
    // The per-user hourly cap is a separate protection; lift it here so it does
    // not mask the IP throttle this spec is measuring.
    process.env.PASSWORD_RESET_MAX_PER_HOUR = '100';

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MAILER)
      .useValue(mailer)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();
    server = app.getHttpServer();
    prisma = app.get(PrismaService);

    // A dedicated account so this spec never disturbs the seeded demo users that
    // the other specs sign in with. It needs a membership: login refuses an
    // account that belongs to no conservatory.
    const tenant = await prisma.tenant.findFirstOrThrow({ where: { slug: 'armonia' } });
    const passwordHash = await argon2.hash(INITIAL_PASSWORD, { type: argon2.argon2id });
    const user = await prisma.user.create({
      data: {
        email: 'recovery-spec@musicos.test',
        passwordHash,
        firstName: 'Δοκιμή',
        lastName: 'Επαναφοράς',
        locale: 'el',
        status: 'ACTIVE',
        memberships: { create: { tenantId: tenant.id, role: 'STUDENT' } },
      },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.refreshToken.deleteMany({ where: { userId } });
    await prisma.passwordResetToken.deleteMany({ where: { userId } });
    await prisma.membership.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });
    await app.close();
  });

  beforeEach(async () => {
    mailer.reset();
    await prisma.passwordResetToken.deleteMany({ where: { userId } });
  });

  function requestReset() {
    return request(server)
      .post('/api/auth/password-reset/request')
      .send({ email: 'recovery-spec@musicos.test' });
  }

  function extractToken(): string {
    const message = mailer.sent.find((item) => item.template === 'password-reset');
    expect(message).toBeDefined();
    const url = (message?.data as { resetUrl?: string } | undefined)?.resetUrl;
    expect(url).toEqual(expect.any(String));
    return new URL(url as string).searchParams.get('token') as string;
  }

  // Requests used so far: 2
  it('returns an identical response for a known and an unknown address', async () => {
    const unknown = await request(server)
      .post('/api/auth/password-reset/request')
      .send({ email: 'nobody-at-all@musicos.test' });
    const known = await requestReset();

    expect(unknown.status).toBe(202);
    expect(known.status).toBe(202);
    // Byte-identical: the endpoint must not be an account-existence oracle.
    expect(known.body).toEqual(unknown.body);
    expect(JSON.stringify(known.body)).not.toContain('recovery-spec');
  });

  it('rejects a bogus token without consuming a request', async () => {
    await request(server)
      .get('/api/auth/password-reset/validate')
      .query({ token: 'not-a-real-token-but-long-enough' })
      .expect(200)
      .expect({ valid: false });

    await request(server)
      .post('/api/auth/password-reset/confirm')
      .send({ token: 'not-a-real-token-but-long-enough', newPassword: NEW_PASSWORD })
      .expect(400);
  });

  // Requests used so far: 3
  it('resets the password, stores only a hash, revokes sessions and refuses reuse', async () => {
    // Establish a live session first, so we can prove it is revoked.
    const login = await request(server)
      .post('/api/auth/login')
      .send({ email: 'recovery-spec@musicos.test', password: INITIAL_PASSWORD });
    expect(login.status).toBe(200);
    const refreshCookie = login.headers['set-cookie'] as unknown as string[];
    expect(refreshCookie?.length).toBeGreaterThan(0);

    await requestReset().expect(202);

    const token = extractToken();
    expect(token.length).toBeGreaterThan(20);

    const rows = await prisma.passwordResetToken.findMany({ where: { userId } });
    expect(rows).toHaveLength(1);
    expect(rows[0].tokenHash).not.toBe(token);
    expect(rows[0].usedAt).toBeNull();

    await request(server)
      .get('/api/auth/password-reset/validate')
      .query({ token })
      .expect(200)
      .expect({ valid: true });

    await request(server)
      .post('/api/auth/password-reset/confirm')
      .send({ token, newPassword: NEW_PASSWORD })
      .expect(200);

    // Old password is dead, new one works.
    await request(server)
      .post('/api/auth/login')
      .send({ email: 'recovery-spec@musicos.test', password: INITIAL_PASSWORD })
      .expect(401);

    await request(server)
      .post('/api/auth/login')
      .send({ email: 'recovery-spec@musicos.test', password: NEW_PASSWORD })
      .expect(200);

    // The pre-reset refresh cookie must no longer mint a session.
    await request(server)
      .post('/api/auth/refresh')
      .set('Cookie', refreshCookie)
      .send({})
      .expect(401);

    // Single use.
    await request(server)
      .post('/api/auth/password-reset/confirm')
      .send({ token, newPassword: 'AnotherPass789!' })
      .expect(400);
  });

  // Requests used so far: 5 — at the limit.
  it('marks older unused tokens as used when a new one is issued', async () => {
    await requestReset().expect(202);
    const first = extractToken();

    await requestReset().expect(202);

    await request(server)
      .get('/api/auth/password-reset/validate')
      .query({ token: first })
      .expect(200)
      .expect({ valid: false });
  });

  // Requests used so far: 6 — one past the limit.
  it('rate-limits repeated requests from one address', async () => {
    const response = await requestReset();
    expect(response.status).toBe(429);
    expect(IP_THROTTLE_LIMIT).toBe(5);
  });
});
