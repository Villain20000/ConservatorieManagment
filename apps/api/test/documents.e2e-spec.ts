import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';

const PASSWORD = 'MusicOS2026!';
const RANDOM_ID = '00000000-0000-4000-8000-000000000000';

describe('Documents API (e2e)', () => {
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
    return response.body.accessToken as string;
  }

  async function firstStudentId(token: string): Promise<string> {
    const response = await request(server)
      .get('/api/students?pageSize=5')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    return response.body.data[0].id as string;
  }

  it('requires authentication for the documents list', async () => {
    await request(server).get('/api/documents').expect(401);
  });

  it('denies students the documents list (DOCUMENTS_READ)', async () => {
    const token = await login('student@armonia.test');
    await request(server)
      .get('/api/documents')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('lists seeded documents, templates and stats', async () => {
    const token = await login('director@armonia.test');
    const auth = { Authorization: `Bearer ${token}` };

    const listed = await request(server).get('/api/documents').set(auth);
    expect(listed.status).toBe(200);
    expect(Array.isArray(listed.body.data)).toBe(true);
    expect(listed.body.data.length).toBeGreaterThan(0);

    const templates = await request(server).get('/api/documents/templates').set(auth);
    expect(templates.status).toBe(200);
    expect(Array.isArray(templates.body.data)).toBe(true);
    expect(templates.body.data.length).toBeGreaterThan(0);

    const stats = await request(server).get('/api/documents/stats').set(auth);
    expect(stats.status).toBe(200);
  });

  it('runs a draft -> issue -> pdf -> archive lifecycle', async () => {
    const token = await login('director@armonia.test');
    const auth = { Authorization: `Bearer ${token}` };
    const studentId = await firstStudentId(token);

    const created = await request(server).post('/api/documents').set(auth).send({
      studentId,
      type: 'ATTENDANCE_CERTIFICATE',
      title: `E2E βεβαίωση ${Date.now()}`,
      draft: true,
    });
    expect([200, 201]).toContain(created.status);
    const id = created.body.id as string;

    const fetched = await request(server).get(`/api/documents/${id}`).set(auth);
    expect(fetched.status).toBe(200);
    expect(fetched.body.status).toBe('DRAFT');

    const issued = await request(server).post(`/api/documents/${id}/issue`).set(auth);
    expect(issued.status).toBe(200);
    expect(issued.body.status).toBe('ISSUED');
    expect(issued.body.protocolNumber).toEqual(expect.any(String));

    const pdf = await request(server).get(`/api/documents/${id}/pdf`).set(auth);
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toContain('application/pdf');

    const versions = await request(server).get(`/api/documents/${id}/versions`).set(auth);
    expect(versions.status).toBe(200);
    expect(Array.isArray(versions.body.data)).toBe(true);

    const archived = await request(server)
      .post(`/api/documents/${id}/archive`)
      .set(auth)
      .send({ reason: 'E2E αρχειοθέτηση ελέγχου' });
    expect(archived.status).toBe(200);
    expect(archived.body.status).toBe('ARCHIVED');
  });

  it('serves per-student documents and rejects unknown references', async () => {
    const token = await login('director@armonia.test');
    const auth = { Authorization: `Bearer ${token}` };
    const studentId = await firstStudentId(token);

    const scoped = await request(server)
      .get(`/api/students/${studentId}/documents`)
      .set(auth);
    expect(scoped.status).toBe(200);
    expect(Array.isArray(scoped.body.data ?? scoped.body)).toBe(true);

    await request(server).get(`/api/documents/${RANDOM_ID}`).set(auth).expect(404);

    await request(server)
      .post('/api/documents')
      .set(auth)
      .send({ type: 'REGISTRATION_FORM', title: 'Χωρίς μαθητή' })
      .expect(400);

    await request(server)
      .post('/api/documents')
      .set(auth)
      .send({ studentId: RANDOM_ID, type: 'REGISTRATION_FORM' })
      .expect(404);
  });
});
