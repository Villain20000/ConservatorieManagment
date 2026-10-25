import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import { generateSync } from 'otplib';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma.service.js';

const PASSWORD = 'MfaSpecPass123!';
const TOTP = { digits: 6, period: 30 };

describe('MFA (e2e)', () => {
  let app: INestApplication;
  let server: Parameters<typeof request>[0];
  let prisma: PrismaService;
  let userId: string;
  let secret: string;
  let recoveryCodes: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
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

    const tenant = await prisma.tenant.findFirstOrThrow({ where: { slug: 'armonia' } });
    const branch = await prisma.branch.findFirstOrThrow({ where: { tenantId: tenant.id } });
    const passwordHash = await argon2.hash(PASSWORD, { type: argon2.argon2id });

    const user = await prisma.user.create({
      data: {
        email: 'mfa-spec@musicos.test',
        passwordHash,
        firstName: 'Δοκιμή',
        lastName: 'MFA',
        locale: 'el',
        status: 'ACTIVE',
        memberships: {
          create: {
            tenantId: tenant.id,
            role: 'DIRECTOR',
            branchId: branch.id,
          },
        },
      },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.refreshToken.deleteMany({ where: { userId } });
    await prisma.mfaRecoveryCode.deleteMany({ where: { userId } });
    await prisma.membership.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });
    await app.close();
  });

  async function login() {
    return request(server)
      .post('/api/auth/login')
      .send({ email: 'mfa-spec@musicos.test', password: PASSWORD });
  }

  it('starts with MFA disabled', async () => {
    const session = await login();
    expect(session.status).toBe(200);
    expect(session.body.mfaRequired).toBe(false);
    expect(session.body.accessToken).toEqual(expect.any(String));
  });

  it('enrols, activates and returns recovery codes exactly once', async () => {
    const session = await login();
    const auth = { Authorization: `Bearer ${session.body.accessToken}` };

    const enrolled = await request(server).post('/api/auth/mfa/enroll').set(auth);
    expect(enrolled.status).toBe(200);
    expect(enrolled.body.secret).toEqual(expect.any(String));
    expect(enrolled.body.otpauthUri).toContain('otpauth://totp/');
    expect(enrolled.body.qrDataUrl).toContain('data:image/png;base64,');
    secret = enrolled.body.secret;

    const code = generateSync({ secret, ...TOTP });
    const activated = await request(server)
      .post('/api/auth/mfa/activate')
      .set(auth)
      .send({ code });

    expect(activated.status).toBe(200);
    expect(activated.body.recoveryCodes).toHaveLength(10);
    recoveryCodes = activated.body.recoveryCodes;

    // Stored hashed, never in plain text.
    const stored = await prisma.mfaRecoveryCode.findMany({ where: { userId } });
    expect(stored).toHaveLength(10);
    for (const row of stored) {
      expect(recoveryCodes).not.toContain(row.codeHash);
    }
  });

  it('pauses login on a second factor and issues no session', async () => {
    const response = await login();
    expect(response.status).toBe(200);
    expect(response.body.mfaRequired).toBe(true);
    expect(response.body.accessToken).toBeUndefined();
    // No refresh cookie either: the session does not exist yet.
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('refuses a challenge token used as an access token', async () => {
    const response = await login();
    const challengeToken = response.body.challengeToken as string;

    await request(server)
      .get('/api/dashboard')
      .set('Authorization', `Bearer ${challengeToken}`)
      .expect(401);
  });

  it('rejects a wrong code', async () => {
    const response = await login();
    await request(server)
      .post('/api/auth/mfa/verify')
      .send({ challengeToken: response.body.challengeToken, code: '000000' })
      .expect(401);
  });

  it('accepts a recovery code once and refuses it the second time', async () => {
    const response = await login();
    const challengeToken = response.body.challengeToken as string;
    const code = recoveryCodes[0];

    const verified = await request(server)
      .post('/api/auth/mfa/verify')
      .send({ challengeToken, code });

    expect(verified.status).toBe(200);
    expect(verified.body.accessToken).toEqual(expect.any(String));
    expect(verified.body.user.email).toBe('mfa-spec@musicos.test');

    await request(server)
      .post('/api/auth/mfa/verify')
      .send({ challengeToken, code })
      .expect(401);
  });

  it('reports status and refuses a second enrolment', async () => {
    const session = await login();
    // MFA is enabled now, so login pauses — use the verify path to get a session.
    const challengeToken = session.body.challengeToken as string;
    const verified = await request(server)
      .post('/api/auth/mfa/verify')
      .send({ challengeToken, code: recoveryCodes[1] });
    expect(verified.status).toBe(200);

    const auth = { Authorization: `Bearer ${verified.body.accessToken}` };

    const status = await request(server).get('/api/auth/mfa/status').set(auth);
    expect(status.status).toBe(200);
    expect(status.body.enabled).toBe(true);
    expect(status.body.enrolledAt).toEqual(expect.any(String));
    // One code was consumed by the previous test, one by this one.
    expect(status.body.recoveryCodesRemaining).toBe(8);

    // Re-enrolling an already-enrolled account is a conflict, not a silent reset.
    const again = await request(server).post('/api/auth/mfa/enroll').set(auth);
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('MFA_ALREADY_ENABLED');
  });

  it('requires the password to disable MFA', async () => {
    const session = await login();
    const challengeToken = session.body.challengeToken as string;
    const verified = await request(server)
      .post('/api/auth/mfa/verify')
      .send({ challengeToken, code: recoveryCodes[2] });
    expect(verified.status).toBe(200);
    const auth = { Authorization: `Bearer ${verified.body.accessToken}` };

    const wrong = await request(server)
      .post('/api/auth/mfa/disable')
      .set(auth)
      .send({ password: 'not-the-password', code: recoveryCodes[3] });
    expect(wrong.status).toBe(401);
  });
});
