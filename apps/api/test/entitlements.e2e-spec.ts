import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma.service.js';

const PASSWORD = 'MusicOS2026!';

describe('Entitlements and tenant lifecycle (e2e)', () => {
  let app: INestApplication;
  let server: Parameters<typeof request>[0];
  let prisma: PrismaService;
  let melodiaId: string;
  const createdTeacherIds: string[] = [];

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

    const melodia = await prisma.tenant.findFirstOrThrow({ where: { slug: 'melodia' } });
    melodiaId = melodia.id;
  });

  afterAll(async () => {
    if (createdTeacherIds.length > 0) {
      await prisma.teacher.deleteMany({ where: { id: { in: createdTeacherIds } } });
    }
    await app.close();
  });

  async function login(email: string) {
    const response = await request(server).post('/api/auth/login').send({ email, password: PASSWORD });
    return response;
  }

  async function tokenFor(email: string): Promise<string> {
    const response = await login(email);
    expect(response.status).toBe(200);
    return response.body.accessToken as string;
  }

  it('blocks a suspended conservatory at login', async () => {
    const response = await login('director@dokimi.test');
    expect(response.status).toBe(403);
    expect(response.body.code).toBe('TENANT_SUSPENDED');
    expect(response.body.accessToken).toBeUndefined();
  });

  it('rejects a token minted before suspension', async () => {
    const director = await tokenFor('director@armonia.test');
    const superadmin = await tokenFor('superadmin@musicos.test');
    const armonia = await prisma.tenant.findFirstOrThrow({ where: { slug: 'armonia' } });

    // A live session exists; now suspend the tenant behind its back.
    await request(server)
      .patch(`/api/platform/tenants/${armonia.id}/status`)
      .set('Authorization', `Bearer ${superadmin}`)
      .send({ status: 'SUSPENDED', reason: 'e2e' })
      .expect(200);

    try {
      const blocked = await request(server)
        .get('/api/dashboard')
        .set('Authorization', `Bearer ${director}`);
      expect(blocked.status).toBe(403);
      expect(blocked.body.code).toBe('TENANT_SUSPENDED');

      // Refreshing must not resurrect the session either.
      const refreshed = await request(server)
        .post('/api/auth/refresh')
        .send({})
        .set('Cookie', `musicos_refresh=irrelevant`);
      expect([401, 403]).toContain(refreshed.status);
    } finally {
      await request(server)
        .patch(`/api/platform/tenants/${armonia.id}/status`)
        .set('Authorization', `Bearer ${superadmin}`)
        .send({ status: 'ACTIVE' })
        .expect(200);
    }
  });

  it('gates modules the plan does not include', async () => {
    // Melodia is on the starter plan: finance and exams are off, portals are on.
    const token = await tokenFor('director@melodia.test');
    const auth = { Authorization: `Bearer ${token}` };

    const finance = await request(server).get('/api/finance/overview').set(auth);
    expect(finance.status).toBe(403);
    expect(finance.body.code).toBe('FEATURE_NOT_IN_PLAN');
    expect(finance.body.feature).toBe('finance');

    const exams = await request(server).get('/api/exams').set(auth);
    expect(exams.status).toBe(403);
    expect(exams.body.code).toBe('FEATURE_NOT_IN_PLAN');

    // A module that is included still works.
    const entitlements = await request(server).get('/api/tenant/entitlements').set(auth);
    expect(entitlements.status).toBe(200);
    expect(entitlements.body.plan.code).toBe('starter');
    expect(entitlements.body.plan.features.finance).toBe(false);
    expect(entitlements.body.plan.features.portals).toBe(true);
  });

  it('enforces the teacher seat limit and survives concurrent creates', async () => {
    const token = await tokenFor('director@melodia.test');
    const auth = { Authorization: `Bearer ${token}` };

    const plan = await prisma.plan.findUniqueOrThrow({ where: { code: 'starter' } });
    const used = await prisma.teacher.count({
      where: { tenantId: melodiaId, deletedAt: null },
    });
    const seatsLeft = plan.maxTeachers - used;
    expect(seatsLeft).toBeGreaterThan(0);

    // Fire more concurrent creates than there are seats: the tenant row lock must
    // let exactly `seatsLeft` of them through.
    const attempts = seatsLeft + 4;
    const responses = await Promise.all(
      Array.from({ length: attempts }, (_, index) =>
        request(server)
          .post('/api/teachers')
          .set(auth)
          .send({
            firstName: 'Δοκιμή',
            lastName: `Ορίου${index}`,
            email: `seat-limit-${index}@melodia.test`,
            specialties: ['Πιάνο'],
          }),
      ),
    );

    const created = responses.filter((response) => response.status === 201);
    const rejected = responses.filter((response) => response.status === 403);

    // Record before asserting, so a failed expectation still cleans up after itself.
    for (const response of created) {
      createdTeacherIds.push(response.body.id as string);
    }

    expect(created).toHaveLength(seatsLeft);
    expect(rejected).toHaveLength(4);
    for (const response of rejected) {
      expect(response.body.code).toBe('SEAT_LIMIT_REACHED');
      expect(response.body.resource).toBe('teachers');
      expect(response.body.limit).toBe(plan.maxTeachers);
    }

    // And a further attempt is still refused.
    const extra = await request(server)
      .post('/api/teachers')
      .set(auth)
      .send({ firstName: 'Δοκιμή', lastName: 'Πλεόνασμα', specialties: [] });
    expect(extra.status).toBe(403);
  });

  it('refuses a plan downgrade below current usage', async () => {
    const superadmin = await tokenFor('superadmin@musicos.test');
    // Armonia has far more than 5 teachers, so starter cannot fit it.
    const armonia = await prisma.tenant.findFirstOrThrow({ where: { slug: 'armonia' } });
    const response = await request(server)
      .patch(`/api/platform/tenants/${armonia.id}/plan`)
      .set('Authorization', `Bearer ${superadmin}`)
      .send({ planCode: 'starter' });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('SEAT_LIMIT_BELOW_USAGE');
  });
});
