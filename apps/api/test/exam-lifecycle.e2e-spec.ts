import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';

const PASSWORD = 'MusicOS2026!';

function asArray(body: any): any[] {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.data)) return body.data;
  throw new Error(`Expected array response, got: ${JSON.stringify(body).slice(0, 200)}`);
}

describe('Exams lifecycle API (e2e)', () => {
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

  it('runs a full exam lifecycle: period -> exam -> application -> grading -> publish -> minutes', async () => {
    const token = await login('director@armonia.test');
    const auth = { Authorization: `Bearer ${token}` };
    const stamp = Date.now();

    const years = await request(server).get('/api/academics/academic-years').set(auth);
    expect(years.status).toBe(200);
    const academicYearId = asArray(years.body)[0].id as string;

    const period = await request(server).post('/api/exams/periods').set(auth).send({
      academicYearId,
      name: `E2E περίοδος ${stamp}`,
      startsOn: '2026-11-01',
      endsOn: '2026-12-20',
    });
    expect([200, 201]).toContain(period.status);
    const periodId = period.body.id as string;

    const programs = await request(server).get('/api/academics/programs').set(auth);
    expect(programs.status).toBe(200);
    const programId = asArray(programs.body)[0].id as string;

    const exam = await request(server).post('/api/exams').set(auth).send({
      programId,
      periodId,
      title: `E2E εξέταση ${stamp}`,
      type: 'PERIODIC',
      examDate: '2026-12-10T17:00:00.000Z',
      location: 'Αίθουσα E2E',
    });
    expect([200, 201]).toContain(exam.status);
    const examId = exam.body.id as string;
    expect(exam.body.status).toBe('SCHEDULED');

    const patched = await request(server)
      .patch(`/api/exams/${examId}`)
      .set(auth)
      .send({ location: 'Αίθουσα Συναυλιών' });
    expect(patched.status).toBe(200);
    expect(patched.body.location).toBe('Αίθουσα Συναυλιών');

    const teachers = await request(server).get('/api/teachers?pageSize=1').set(auth);
    expect(teachers.status).toBe(200);
    const teacherId = asArray(teachers.body)[0].id as string;
    const committee = await request(server)
      .put(`/api/exams/${examId}/committee`)
      .set(auth)
      .send({ members: [{ teacherId, role: 'PRESIDENT' }] });
    expect(committee.status).toBe(200);

    // Applications are only valid for students actively enrolled in the
    // exam's programme, so take an eligible row from the exam roster.
    const roster = await request(server).get(`/api/exams/${examId}/results`).set(auth);
    expect(roster.status).toBe(200);
    const eligible = (roster.body.students as any[]).find((row) => row.eligible);
    expect(eligible).toBeDefined();
    const studentId = eligible.student.id as string;

    const application = await request(server)
      .post(`/api/exams/${examId}/applications`)
      .set(auth)
      .send({ studentId, notes: 'E2E αίτηση συμμετοχής' });
    expect([200, 201]).toContain(application.status);
    const applicationId = application.body.id as string;

    const decided = await request(server)
      .patch(`/api/exams/${examId}/applications/${applicationId}`)
      .set(auth)
      .send({ status: 'APPROVED' });
    expect(decided.status).toBe(200);
    expect(decided.body.status).toBe('APPROVED');

    const graded = await request(server)
      .put(`/api/exams/${examId}/results`)
      .set(auth)
      .send({ results: [{ studentId, grade: 85, notes: 'E2E βαθμολογία' }] });
    expect(graded.status).toBe(200);

    const submitted = await request(server)
      .post(`/api/exams/${examId}/results/submit`)
      .set(auth);
    expect(submitted.status).toBe(200);

    const approved = await request(server)
      .post(`/api/exams/${examId}/results/approve`)
      .set(auth);
    expect(approved.status).toBe(200);

    const published = await request(server).post(`/api/exams/${examId}/publish`).set(auth);
    expect(published.status).toBe(200);
    expect(published.body.status).toBe('PUBLISHED');

    const minutes = await request(server).post(`/api/exams/${examId}/minutes`).set(auth);
    expect(minutes.status).toBe(200);

    const studentResults = await request(server)
      .get(`/api/students/${studentId}/exam-results`)
      .set(auth);
    expect(studentResults.status).toBe(200);
    expect((studentResults.body.data as any[]).some((row) => row.examId === examId)).toBe(true);

    // Published results are official: cancelling the exam must be refused.
    const cancelled = await request(server).post(`/api/exams/${examId}/cancel`).set(auth);
    expect(cancelled.status).toBe(409);
  });

  it('rejects duplicate exam period names for the same academic year', async () => {
    const token = await login('director@armonia.test');
    const auth = { Authorization: `Bearer ${token}` };

    const years = await request(server).get('/api/academics/academic-years').set(auth);
    const academicYearId = asArray(years.body)[0].id as string;
    const name = `E2E διπλή περίοδος ${Date.now()}`;
    const payload = {
      academicYearId,
      name,
      startsOn: '2026-11-01',
      endsOn: '2026-12-20',
    };

    const first = await request(server).post('/api/exams/periods').set(auth).send(payload);
    expect([200, 201]).toContain(first.status);
    await request(server).post('/api/exams/periods').set(auth).send(payload).expect(409);
  });
});
