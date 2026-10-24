import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';

const PASSWORD = 'MusicOS2026!';

describe('Announcements API (e2e)', () => {
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

  it('requires authentication for the announcements list', async () => {
    await request(server).get('/api/announcements').expect(401);
  });

  it('lists seeded announcements for directors and students', async () => {
    for (const email of ['director@armonia.test', 'student@armonia.test']) {
      const token = await login(email);
      const response = await request(server)
        .get('/api/announcements')
        .set('Authorization', `Bearer ${token}`);
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);
    }
  });

  it('denies students announcement writes (ANNOUNCEMENTS_WRITE)', async () => {
    const token = await login('student@armonia.test');
    await request(server)
      .post('/api/announcements')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Μαθητική ανακοίνωση', body: 'Δεν πρέπει να δημοσιευτεί.' })
      .expect(403);
  });

  it('runs a create -> update -> delete lifecycle as director', async () => {
    const token = await login('director@armonia.test');
    const auth = { Authorization: `Bearer ${token}` };
    const title = `E2E ανακοίνωση ${Date.now()}`;

    const created = await request(server).post('/api/announcements').set(auth).send({
      title,
      body: 'Αυτή η ανακοίνωση δημιουργήθηκε από αυτόματο έλεγχο.',
      audienceRoles: ['STUDENT', 'GUARDIAN'],
    });
    expect([200, 201]).toContain(created.status);
    const id = created.body.id as string;
    expect(created.body.title).toBe(title);

    const listed = await request(server).get('/api/announcements').set(auth);
    expect(listed.status).toBe(200);
    expect((listed.body.data as any[]).some((row) => row.id === id)).toBe(true);

    const updated = await request(server)
      .patch(`/api/announcements/${id}`)
      .set(auth)
      .send({ title: `${title} (επικαιροποιημένη)`, isPinned: true });
    expect(updated.status).toBe(200);
    expect(updated.body.title).toContain('(επικαιροποιημένη)');

    const removed = await request(server).delete(`/api/announcements/${id}`).set(auth);
    expect(removed.status).toBe(200);

    const relisted = await request(server).get('/api/announcements').set(auth);
    expect(relisted.status).toBe(200);
    expect((relisted.body.data as any[]).some((row) => row.id === id)).toBe(false);
  });

  it('returns 404 when updating or deleting an unknown announcement', async () => {
    const token = await login('director@armonia.test');
    const auth = { Authorization: `Bearer ${token}` };
    const unknown = '00000000-0000-4000-8000-000000000000';

    await request(server)
      .patch(`/api/announcements/${unknown}`)
      .set(auth)
      .send({ title: 'Ανύπαρκτη' })
      .expect(404);
    await request(server).delete(`/api/announcements/${unknown}`).set(auth).expect(404);
  });

  it('exposes notifications and marks them read', async () => {
    const token = await login('director@armonia.test');
    const auth = { Authorization: `Bearer ${token}` };

    const listed = await request(server).get('/api/notifications').set(auth);
    expect(listed.status).toBe(200);
    expect(Array.isArray(listed.body.data)).toBe(true);

    const unread = await request(server)
      .get('/api/notifications?unreadOnly=true')
      .set(auth);
    expect(unread.status).toBe(200);

    const allRead = await request(server).post('/api/notifications/read-all').set(auth);
    expect(allRead.status).toBe(200);

    const after = await request(server)
      .get('/api/notifications?unreadOnly=true')
      .set(auth);
    expect(after.status).toBe(200);
    expect(after.body.data).toEqual([]);
  });
});
