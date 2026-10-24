import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';

const PASSWORD = 'MusicOS2026!';
const RANDOM_ID = '00000000-0000-4000-8000-000000000000';

describe('Attendance API (e2e)', () => {
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

  /** Finds a lesson that actually has enrolled students to record attendance for. */
  async function lessonWithStudents(token: string): Promise<{ id: string; studentIds: string[] }> {
    // The lessons endpoint returns the current teaching week; no paging param.
    const lessons = await request(server)
      .get('/api/lessons')
      .set('Authorization', `Bearer ${token}`);
    expect(lessons.status).toBe(200);
    const rows = lessons.body.data as any[];
    expect(rows.length).toBeGreaterThan(0);
    for (const lesson of rows.slice(0, 10)) {
      const roster = await request(server)
        .get(`/api/lessons/${lesson.id}/attendance`)
        .set('Authorization', `Bearer ${token}`);
      expect(roster.status).toBe(200);
      const studentIds = (roster.body.students as any[]).map((row) => row.student.id);
      if (studentIds.length > 0) return { id: lesson.id as string, studentIds };
    }
    throw new Error('No seeded lesson with enrolled students found');
  }

  it('requires authentication for attendance reads', async () => {
    await request(server).get('/api/attendance').expect(401);
    await request(server).get(`/api/lessons/${RANDOM_ID}/attendance`).expect(401);
  });

  it('denies students attendance writes', async () => {
    const token = await login('student@armonia.test');
    await request(server)
      .put(`/api/lessons/${RANDOM_ID}/attendance`)
      .set('Authorization', `Bearer ${token}`)
      .send({ records: [] })
      .expect(403);
  });

  it('records attendance and reads it back from the roster', async () => {
    const token = await login('director@armonia.test');
    const auth = { Authorization: `Bearer ${token}` };
    const { id: lessonId, studentIds } = await lessonWithStudents(token);

    const saved = await request(server)
      .put(`/api/lessons/${lessonId}/attendance`)
      .set(auth)
      .send({
        records: studentIds.map((studentId, index) => ({
          studentId,
          status: index === 0 ? 'ABSENT' : 'PRESENT',
          notes: index === 0 ? 'E2E απουσία ελέγχου' : null,
        })),
      });
    expect(saved.status).toBe(200);
    expect(saved.body.summary.total).toBe(studentIds.length);
    expect(saved.body.summary.PRESENT + saved.body.summary.ABSENT).toBe(studentIds.length);

    const roster = await request(server).get(`/api/lessons/${lessonId}/attendance`).set(auth);
    expect(roster.status).toBe(200);
    expect(roster.body.students.length).toBe(studentIds.length);
    const marked = (roster.body.students as any[]).find(
      (row) => row.student.id === studentIds[0],
    );
    expect(marked.attendance.status).toBe('ABSENT');
  });

  it('rejects attendance for students outside the lesson', async () => {
    const token = await login('director@armonia.test');
    const auth = { Authorization: `Bearer ${token}` };
    const { id: lessonId } = await lessonWithStudents(token);

    await request(server)
      .put(`/api/lessons/${lessonId}/attendance`)
      .set(auth)
      .send({ records: [{ studentId: RANDOM_ID, status: 'PRESENT' }] })
      .expect(400);
  });

  it('adds and removes a lesson note as director', async () => {
    const token = await login('director@armonia.test');
    const auth = { Authorization: `Bearer ${token}` };
    const { id: lessonId } = await lessonWithStudents(token);

    const added = await request(server)
      .post(`/api/lessons/${lessonId}/notes`)
      .set(auth)
      .send({ content: 'E2E σημείωση μαθήματος' });
    expect([200, 201]).toContain(added.status);
    const noteId = added.body.id as string;

    const removed = await request(server)
      .delete(`/api/lessons/${lessonId}/notes/${noteId}`)
      .set(auth);
    expect(removed.status).toBe(200);
  });

  it('lists attendance entries and serves a per-student summary', async () => {
    const token = await login('director@armonia.test');
    const auth = { Authorization: `Bearer ${token}` };
    const { id: lessonId, studentIds } = await lessonWithStudents(token);

    const listed = await request(server)
      .get(`/api/attendance?lessonId=${lessonId}`)
      .set(auth);
    expect(listed.status).toBe(200);
    expect(Array.isArray(listed.body.data)).toBe(true);
    expect(listed.body.data.length).toBeGreaterThan(0);

    const summary = await request(server)
      .get(`/api/attendance/summary?studentId=${studentIds[0]}`)
      .set(auth);
    expect(summary.status).toBe(200);
  });

  it('returns 404 for the roster of an unknown lesson', async () => {
    const token = await login('director@armonia.test');
    await request(server)
      .get(`/api/lessons/${RANDOM_ID}/attendance`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });
});
