import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';

const PASSWORD = 'MusicOS2026!';
const RANDOM_ID = '00000000-0000-4000-8000-000000000000';

describe('Exams API (e2e)', () => {
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

  it('requires authentication for the exams list', async () => {
    await request(server).get('/api/exams').expect(401);
  });

  it('lets a director list exams and periods', async () => {
    const token = await login('director@armonia.test');
    const exams = await request(server)
      .get('/api/exams')
      .set('Authorization', `Bearer ${token}`);
    expect(exams.status).toBe(200);
    expect(Array.isArray(exams.body.data)).toBe(true);

    const periods = await request(server)
      .get('/api/exams/periods')
      .set('Authorization', `Bearer ${token}`);
    expect(periods.status).toBe(200);
    expect(Array.isArray(periods.body)).toBe(true);
  });

  it('denies students the exams list (EXAMS_READ)', async () => {
    const token = await login('student@armonia.test');
    await request(server)
      .get('/api/exams')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('enforces EXAMS_WRITE on exam creation', async () => {
    const studentToken = await login('student@armonia.test');
    await request(server)
      .post('/api/exams')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ programId: RANDOM_ID, title: 'Test', examDate: new Date().toISOString() })
      .expect(403);

    const teacherToken = await login('teacher@armonia.test');
    await request(server)
      .post('/api/exams')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ programId: RANDOM_ID, title: 'Test', examDate: new Date().toISOString() })
      .expect(403);
  });

  it('lets teachers reach grading but not approval (EXAMS_GRADE vs EXAMS_APPROVE)', async () => {
    const teacherToken = await login('teacher@armonia.test');
    const gradeAttempt = await request(server)
      .put(`/api/exams/${RANDOM_ID}/results`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ results: [] });
    expect(gradeAttempt.status).not.toBe(403);

    await request(server)
      .post(`/api/exams/${RANDOM_ID}/results/approve`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(403);

    const studentToken = await login('student@armonia.test');
    await request(server)
      .put(`/api/exams/${RANDOM_ID}/results`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ results: [] })
      .expect(403);
  });

  it('enforces EXAMS_APPROVE on publish for non-approvers', async () => {
    const teacherToken = await login('teacher@armonia.test');
    await request(server)
      .post(`/api/exams/${RANDOM_ID}/publish`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(403);
  });

  it('returns 404 for minutes of an unknown exam', async () => {
    const token = await login('director@armonia.test');
    await request(server)
      .post(`/api/exams/${RANDOM_ID}/minutes`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('rejects an exam period for an unknown academic year', async () => {
    const token = await login('director@armonia.test');
    const response = await request(server)
      .post('/api/exams/periods')
      .set('Authorization', `Bearer ${token}`)
      .send({
        academicYearId: RANDOM_ID,
        name: 'Χειμερινή',
        startsOn: '2026-01-10',
        endsOn: '2026-02-10',
      });
    expect(response.status).toBe(404);
  });
});
