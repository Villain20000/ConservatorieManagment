import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';

const PASSWORD = 'MusicOS2026!';

describe('Guardian login + portal API (e2e)', () => {
  let app: INestApplication;
  let server: Parameters<typeof request>[0];

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
  });

  afterAll(async () => {
    await app.close();
  });

  it('logs in a guardian with a guardian membership', async () => {
    const response = await request(server)
      .post('/api/auth/login')
      .send({ email: 'guardian@armonia.test', password: PASSWORD });
    expect(response.status).toBe(200);
    expect(response.body.user.email).toBe('guardian@armonia.test');
    expect(response.body.accessToken).toEqual(expect.any(String));
    const roles = (response.body.memberships as any[]).map((membership) => membership.role);
    expect(roles).toContain('GUARDIAN');
  });

  it('rejects guardian login with invalid credentials', async () => {
    await request(server)
      .post('/api/auth/login')
      .send({ email: 'guardian@armonia.test', password: 'wrong-password' })
      .expect(401);
  });

  it('blocks guardians from tenant management screens', async () => {
    const login = await request(server)
      .post('/api/auth/login')
      .send({ email: 'guardian@armonia.test', password: PASSWORD });
    const token = login.body.accessToken as string;
    const auth = { Authorization: `Bearer ${token}` };

    await request(server).get('/api/finance/overview').set(auth).expect(403);
    await request(server).get('/api/students').set(auth).expect(403);
    await request(server).get('/api/exams').set(auth).expect(403);
    await request(server).get('/api/documents').set(auth).expect(403);
  });

  it('serves the guardian children list and every portal section', async () => {
    const login = await request(server)
      .post('/api/auth/login')
      .send({ email: 'guardian@armonia.test', password: PASSWORD });
    const token = login.body.accessToken as string;
    const auth = { Authorization: `Bearer ${token}` };

    const children = await request(server).get('/api/portal/children').set(auth);
    expect(children.status).toBe(200);
    expect(Array.isArray(children.body.data)).toBe(true);
    expect(children.body.data.length).toBeGreaterThan(0);
    const childId = children.body.data[0].id as string;

    for (const path of [
      `/api/portal/me?studentId=${childId}`,
      `/api/portal/overview?studentId=${childId}`,
      `/api/portal/schedule?studentId=${childId}`,
      `/api/portal/attendance?studentId=${childId}`,
      `/api/portal/results?studentId=${childId}`,
      `/api/portal/finance?studentId=${childId}`,
      `/api/portal/documents?studentId=${childId}`,
    ]) {
      const response = await request(server).get(path).set(auth);
      expect(response.status).toBe(200);
    }
  });

  it('lets a guardian download their child document PDF', async () => {
    const login = await request(server)
      .post('/api/auth/login')
      .send({ email: 'guardian@armonia.test', password: PASSWORD });
    const token = login.body.accessToken as string;
    const auth = { Authorization: `Bearer ${token}` };

    const children = await request(server).get('/api/portal/children').set(auth);
    const childId = children.body.data[0].id as string;

    const documents = await request(server)
      .get(`/api/portal/documents?studentId=${childId}`)
      .set(auth);
    expect(documents.status).toBe(200);

    const docs = (documents.body.data ?? documents.body.documents ?? []) as any[];
    if (docs.length === 0) return;
    const pdf = await request(server)
      .get(`/api/portal/documents/${docs[0].id}/pdf?studentId=${childId}`)
      .set(auth);
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toContain('application/pdf');
  });
});
