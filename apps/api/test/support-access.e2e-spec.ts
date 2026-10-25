import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma.service.js';

const PASSWORD = 'MusicOS2026!';
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface SupportGrantBody {
  id: string;
  tenantId: string;
  status: string;
  reason: string;
  ticketRef: string | null;
  expiresAt: string;
  usedAt: string | null;
  revokedAt: string | null;
  tenant: { id: string; name: string; slug: string };
  actor: { id: string; email: string };
}

describe('Support access API (e2e)', () => {
  let app: INestApplication;
  let server: Parameters<typeof request>[0];
  let prisma: PrismaService;
  let superToken: string;
  let superadminId: string;
  let armoniaId: string;
  let melodiaId: string;
  let dokimiId: string;
  let primaryGrant: SupportGrantBody;

  // Unique per run: e2e shares the seeded database and must never assert
  // global counts or reuse ids across runs.
  const RUN = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const REASON = `E2E support access ${RUN}`;
  const TICKET = `SUP-${RUN}`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
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

    const superadmin = await prisma.user.findUniqueOrThrow({
      where: { email: 'superadmin@musicos.test' },
    });
    superadminId = superadmin.id;

    const [armonia, melodia, dokimi] = await Promise.all([
      prisma.tenant.findUniqueOrThrow({ where: { slug: 'armonia' } }),
      prisma.tenant.findUniqueOrThrow({ where: { slug: 'melodia' } }),
      prisma.tenant.findUniqueOrThrow({ where: { slug: 'dokimi' } }),
    ]);
    armoniaId = armonia.id;
    melodiaId = melodia.id;
    dokimiId = dokimi.id;

    superToken = await login('superadmin@musicos.test');
  });

  afterAll(async () => {
    await app.close();
  });

  async function login(email: string): Promise<string> {
    const response = await request(server)
      .post('/api/auth/login')
      .send({ email, password: PASSWORD });
    expect(response.status).toBe(200);
    return response.body.accessToken as string;
  }

  function bearer(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

  async function createGrant(
    overrides: { tenantId?: string; expiresInMinutes?: number } = {},
  ): Promise<SupportGrantBody> {
    const response = await request(server)
      .post('/api/platform/support-grants')
      .set(bearer(superToken))
      .send({
        tenantId: overrides.tenantId ?? armoniaId,
        reason: REASON,
        ticketRef: TICKET,
        expiresInMinutes: overrides.expiresInMinutes ?? 60,
      });
    expect(response.status).toBe(201);
    return response.body as SupportGrantBody;
  }

  it('creates a 60-minute grant for armonia with its tenant and actor', async () => {
    const before = Date.now();
    primaryGrant = await createGrant();

    expect(primaryGrant.status).toBe('ACTIVE');
    expect(primaryGrant.tenantId).toBe(armoniaId);
    expect(primaryGrant.reason).toBe(REASON);
    expect(primaryGrant.ticketRef).toBe(TICKET);
    expect(primaryGrant.tenant).toMatchObject({
      id: armoniaId,
      name: 'Ωδείο Αρμονία',
      slug: 'armonia',
    });
    expect(primaryGrant.actor).toMatchObject({
      id: superadminId,
      email: 'superadmin@musicos.test',
    });

    expect(UUID_PATTERN.test(primaryGrant.id)).toBe(true);
    const expiresAt = new Date(primaryGrant.expiresAt).getTime();
    expect(expiresAt).toBeGreaterThanOrEqual(before + 60 * 60_000 - 1000);
    expect(expiresAt).toBeLessThanOrEqual(Date.now() + 60 * 60_000 + 1000);
  });

  it('grants read-only access to tenant data through the support header', async () => {
    const response = await request(server)
      .get('/api/students?pageSize=5')
      .set(bearer(superToken))
      .set('x-support-grant', primaryGrant.id);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.data.length).toBeGreaterThan(0);
    expect(response.body.data[0].id).toEqual(expect.any(String));
    // The support session must be scoped to the grant's tenant: every student
    // row the tenant endpoint returns belongs to armonia.
    expect(
      response.body.data.every(
        (student: { tenantId: string }) =>
          student.tenantId === primaryGrant.tenantId,
      ),
    ).toBe(true);

    const stored = await prisma.supportAccessGrant.findUniqueOrThrow({
      where: { id: primaryGrant.id },
    });
    expect(stored.usedAt).not.toBeNull();
  });

  it('blocks writes with SUPPORT_READ_ONLY', async () => {
    const response = await request(server)
      .post('/api/students')
      .set(bearer(superToken))
      .set('x-support-grant', primaryGrant.id)
      .send({});

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('SUPPORT_READ_ONLY');
  });

  it('rejects the support header on platform routes', async () => {
    const response = await request(server)
      .get('/api/platform/tenants')
      .set(bearer(superToken))
      .set('x-support-grant', primaryGrant.id);

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('SUPPORT_GRANT_TENANT_ONLY');
  });

  it('rejects malformed and unknown grants with 404', async () => {
    const malformed = await request(server)
      .get('/api/students')
      .set(bearer(superToken))
      .set('x-support-grant', 'zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz');
    expect(malformed.status).toBe(404);

    const unknown = await request(server)
      .get('/api/students')
      .set(bearer(superToken))
      .set('x-support-grant', '00000000-0000-4000-8000-000000000000');
    expect(unknown.status).toBe(404);
  });

  it('rejects a revoked grant with SUPPORT_GRANT_INACTIVE', async () => {
    const grant = await createGrant();
    await request(server)
      .post(`/api/platform/support-grants/${grant.id}/revoke`)
      .set(bearer(superToken))
      .expect(201);

    const response = await request(server)
      .get('/api/students')
      .set(bearer(superToken))
      .set('x-support-grant', grant.id);

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('SUPPORT_GRANT_INACTIVE');
  });

  it('rejects an expired grant and records the lazy expiry', async () => {
    const grant = await createGrant({ expiresInMinutes: 15 });

    // The schema requires expiresAt > createdAt, so move both into the past.
    await prisma.supportAccessGrant.update({
      where: { id: grant.id },
      data: {
        createdAt: new Date(Date.now() - 2 * 60 * 60_000),
        expiresAt: new Date(Date.now() - 60 * 60_000),
      },
    });

    const response = await request(server)
      .get('/api/students')
      .set(bearer(superToken))
      .set('x-support-grant', grant.id);

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('SUPPORT_GRANT_EXPIRED');

    const stored = await prisma.supportAccessGrant.findUniqueOrThrow({
      where: { id: grant.id },
    });
    expect(stored.status).toBe('EXPIRED');
  });

  it('rejects a non-platform user presenting a grant header', async () => {
    const directorToken = await login('director@armonia.test');

    const response = await request(server)
      .get('/api/students')
      .set(bearer(directorToken))
      .set('x-support-grant', primaryGrant.id);

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('SUPPORT_GRANT_FORBIDDEN');
  });

  it('hides a grant from another platform administrator', async () => {
    const superadmin = await prisma.user.findUniqueOrThrow({
      where: { id: superadminId },
    });
    const otherAdmin = await prisma.user.create({
      data: {
        email: `e2e-platform-${RUN}@musicos.test`,
        passwordHash: superadmin.passwordHash,
        firstName: 'E2E',
        lastName: 'Admin',
        isPlatformAdmin: true,
      },
    });

    try {
      const otherToken = await login(otherAdmin.email);
      const response = await request(server)
        .get('/api/students')
        .set(bearer(otherToken))
        .set('x-support-grant', primaryGrant.id);

      expect(response.status).toBe(404);
    } finally {
      await prisma.user.delete({ where: { id: otherAdmin.id } });
    }
  });

  it('still blocks a suspended tenant after the support context is applied', async () => {
    const grant = await createGrant({ tenantId: dokimiId });

    const response = await request(server)
      .get('/api/students')
      .set(bearer(superToken))
      .set('x-support-grant', grant.id);

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('TENANT_SUSPENDED');
  });

  it('audits grant creation and first use for the target tenant only', async () => {
    const granted = await prisma.auditLog.findFirst({
      where: {
        tenantId: armoniaId,
        action: 'support_access.granted',
        entityId: primaryGrant.id,
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(granted).not.toBeNull();
    expect(granted?.actorId).toBe(superadminId);
    expect(
      (granted?.metadata as { ticketRef?: string } | null)?.ticketRef,
    ).toBe(TICKET);

    const started = await prisma.auditLog.findFirst({
      where: {
        tenantId: armoniaId,
        action: 'support_access.started',
        entityId: primaryGrant.id,
      },
    });
    expect(started).not.toBeNull();
    expect(started?.actorId).toBe(superadminId);

    // A second authenticated read with the same grant must not re-stamp first
    // use or write a second support_access.started row.
    const before = await prisma.supportAccessGrant.findUniqueOrThrow({
      where: { id: primaryGrant.id },
      select: { usedAt: true },
    });
    expect(before.usedAt).not.toBeNull();

    const secondUse = await request(server)
      .get('/api/students?pageSize=5')
      .set(bearer(superToken))
      .set('x-support-grant', primaryGrant.id);
    expect(secondUse.status).toBe(200);

    const after = await prisma.supportAccessGrant.findUniqueOrThrow({
      where: { id: primaryGrant.id },
      select: { usedAt: true },
    });
    expect(after.usedAt?.getTime()).toBe(before.usedAt?.getTime());

    const startedCount = await prisma.auditLog.count({
      where: {
        action: 'support_access.started',
        entityId: primaryGrant.id,
      },
    });
    expect(startedCount).toBe(1);

    const platformAudit = await prisma.auditLog.findFirst({
      where: { tenantId: null, entityId: primaryGrant.id },
    });
    expect(platformAudit).toBeNull();
  });

  it('lists and fetches grants through the platform endpoints', async () => {
    const list = await request(server)
      .get(
        `/api/platform/support-grants?tenantId=${armoniaId}&status=ACTIVE&pageSize=100`,
      )
      .set(bearer(superToken));

    expect(list.status).toBe(200);
    expect(list.body.meta).toMatchObject({ page: 1, pageSize: 100 });
    expect(
      list.body.data.some(
        (grant: { id: string }) => grant.id === primaryGrant.id,
      ),
    ).toBe(true);
    expect(
      list.body.data.every(
        (grant: { tenantId: string; status: string }) =>
          grant.tenantId === armoniaId && grant.status === 'ACTIVE',
      ),
    ).toBe(true);

    const single = await request(server)
      .get(`/api/platform/support-grants/${primaryGrant.id}`)
      .set(bearer(superToken));
    expect(single.status).toBe(200);
    expect(single.body.tenant.slug).toBe('armonia');
    expect(single.body.actor.email).toBe('superadmin@musicos.test');

    await request(server)
      .get('/api/platform/support-grants/00000000-0000-4000-8000-000000000000')
      .set(bearer(superToken))
      .expect(404);
  });

  it('rejects a malformed grant id on a platform path with 400', async () => {
    const response = await request(server)
      .get('/api/platform/support-grants/not-a-uuid')
      .set(bearer(superToken));

    expect(response.status).toBe(400);
  });

  it('lets the target director list and revoke, and hides the grant from another tenant', async () => {
    const directorToken = await login('director@armonia.test');

    // A foreign tenantId in the query string must be ignored by the tenant
    // controller; the session's tenant is the only scope.
    const list = await request(server)
      .get(`/api/settings/support-access?tenantId=${melodiaId}`)
      .set(bearer(directorToken));
    expect(list.status).toBe(200);
    expect(list.body.meta).toBeUndefined();
    expect(
      list.body.data.some(
        (grant: { id: string }) => grant.id === primaryGrant.id,
      ),
    ).toBe(true);
    expect(
      list.body.data.every(
        (grant: { tenantId: string }) => grant.tenantId === armoniaId,
      ),
    ).toBe(true);

    const revoked = await request(server)
      .post(`/api/settings/support-access/${primaryGrant.id}/revoke`)
      .set(bearer(directorToken));
    expect(revoked.status).toBe(201);
    expect(revoked.body.status).toBe('REVOKED');
    expect(revoked.body.revokedAt).toEqual(expect.any(String));
    expect(revoked.body.revokedById).toEqual(expect.any(String));

    // Repeating the revoke is idempotent and writes no second audit.
    await request(server)
      .post(`/api/settings/support-access/${primaryGrant.id}/revoke`)
      .set(bearer(directorToken))
      .expect(201);
    const revokeAudits = await prisma.auditLog.count({
      where: {
        tenantId: armoniaId,
        action: 'support_access.revoked',
        entityId: primaryGrant.id,
      },
    });
    expect(revokeAudits).toBe(1);

    const otherDirectorToken = await login('director@melodia.test');

    const otherList = await request(server)
      .get('/api/settings/support-access')
      .set(bearer(otherDirectorToken));
    expect(otherList.status).toBe(200);
    expect(
      otherList.body.data.some(
        (grant: { id: string }) => grant.id === primaryGrant.id,
      ),
    ).toBe(false);
    expect(
      otherList.body.data.every(
        (grant: { tenantId: string }) => grant.tenantId === melodiaId,
      ),
    ).toBe(true);

    await request(server)
      .post(`/api/settings/support-access/${primaryGrant.id}/revoke`)
      .set(bearer(otherDirectorToken))
      .expect(404);
  });
});
