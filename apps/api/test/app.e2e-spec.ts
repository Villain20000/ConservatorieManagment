import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';

const PASSWORD = 'MusicOS2026!';

describe('MusicOS API (e2e)', () => {
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

  async function login(email: string): Promise<string> {
    const response = await request(server)
      .post('/api/auth/login')
      .send({ email, password: PASSWORD });
    expect(response.status).toBe(200);
    expect(response.body.accessToken).toEqual(expect.any(String));
    return response.body.accessToken as string;
  }

  it('reports health', async () => {
    const response = await request(server).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: 'ok', service: 'musicos-api' });
  });

  it('logs in a director with tenant membership', async () => {
    const response = await request(server)
      .post('/api/auth/login')
      .send({ email: 'director@armonia.test', password: PASSWORD });
    expect(response.status).toBe(200);
    expect(response.body.user.email).toBe('director@armonia.test');
    expect(response.body.memberships[0].role).toBe('DIRECTOR');
    expect(response.body.accessToken).toEqual(expect.any(String));
  });

  it('rejects invalid credentials', async () => {
    await request(server)
      .post('/api/auth/login')
      .send({ email: 'director@armonia.test', password: 'wrong-password' })
      .expect(401);
  });

  it('requires authentication for tenant data', async () => {
    await request(server).get('/api/dashboard').expect(401);
  });

  it('returns a role-scoped dashboard', async () => {
    const token = await login('director@armonia.test');
    const response = await request(server)
      .get('/api/dashboard')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.role).toBe('DIRECTOR');
    expect(Array.isArray(response.body.todayLessons)).toBe(true);
  });

  it('enforces role permissions', async () => {
    const token = await login('student@armonia.test');
    await request(server)
      .get('/api/finance/overview')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
    const portal = await request(server)
      .get('/api/portal/me')
      .set('Authorization', `Bearer ${token}`);
    expect(portal.status).toBe(200);
    expect(portal.body.id).toEqual(expect.any(String));
  });

  it('blocks tenant users from the platform console', async () => {
    const token = await login('director@armonia.test');
    await request(server)
      .get('/api/platform/overview')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);

    const adminToken = await login('superadmin@musicos.test');
    const response = await request(server)
      .get('/api/platform/overview')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(response.status).toBe(200);
    expect(response.body.totals.tenants).toBeGreaterThanOrEqual(2);
  });

  it('isolates tenants by returning 404 for foreign records', async () => {
    const armoniaToken = await login('director@armonia.test');
    const melodiaToken = await login('director@melodia.test');

    const melodiaStudents = await request(server)
      .get('/api/students?pageSize=1')
      .set('Authorization', `Bearer ${melodiaToken}`);
    expect(melodiaStudents.status).toBe(200);
    const foreignId = melodiaStudents.body.data[0].id as string;

    await request(server)
      .get(`/api/students/${foreignId}`)
      .set('Authorization', `Bearer ${armoniaToken}`)
      .expect(404);

    const ownStudents = await request(server)
      .get('/api/students?pageSize=1')
      .set('Authorization', `Bearer ${armoniaToken}`);
    expect(ownStudents.status).toBe(200);
    expect(ownStudents.body.data[0].id).not.toBe(foreignId);
  });
});
