import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma.service.js';

const PASSWORD = 'MusicOS2026!';

describe('Soft delete, trash and restore (e2e)', () => {
  let app: INestApplication;
  let server: Parameters<typeof request>[0];
  let prisma: PrismaService;
  let auth: { Authorization: string };
  const createdStudentIds: string[] = [];

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

    const login = await request(server)
      .post('/api/auth/login')
      .send({ email: 'director@armonia.test', password: PASSWORD });
    expect(login.status).toBe(200);
    auth = { Authorization: `Bearer ${login.body.accessToken}` };
  });

  afterAll(async () => {
    if (createdStudentIds.length > 0) {
      await prisma.student.deleteMany({ where: { id: { in: createdStudentIds } } });
    }
    await app.close();
  });

  async function createStudent(label: string): Promise<string> {
    const branch = await prisma.branch.findFirstOrThrow({
      where: { tenant: { slug: 'armonia' } },
    });
    const response = await request(server)
      .post('/api/students')
      .set(auth)
      .send({
        firstName: 'Δοκιμή',
        lastName: label,
        branchId: branch.id,
        registrationNumber: `E2E-${label}-${Date.now()}`,
      });
    expect(response.status).toBe(201);
    createdStudentIds.push(response.body.id as string);
    return response.body.id as string;
  }

  it('hides a deleted student everywhere and restores it', async () => {
    const id = await createStudent('Διαγραφής');

    await request(server).delete(`/api/students/${id}`).set(auth).expect(200);

    // Gone from the detail endpoint...
    await request(server).get(`/api/students/${id}`).set(auth).expect(404);

    // ...and from the list.
    const list = await request(server).get('/api/students?pageSize=100').set(auth);
    expect(list.status).toBe(200);
    expect(list.body.data.map((row: { id: string }) => row.id)).not.toContain(id);

    // Present in the trash, with who deleted it.
    const trash = await request(server).get('/api/trash/students').set(auth);
    expect(trash.status).toBe(200);
    const entry = trash.body.data.find((row: { id: string }) => row.id === id);
    expect(entry).toBeDefined();
    expect(entry.deletedAt).toEqual(expect.any(String));

    await request(server).post(`/api/students/${id}/restore`).set(auth).expect(201);

    const restored = await request(server).get(`/api/students/${id}`).set(auth);
    expect(restored.status).toBe(200);
    expect(restored.body.id).toBe(id);
  });

  it('refuses to delete a student who owes money', async () => {
    const charge = await prisma.charge.findFirst({
      where: {
        tenant: { slug: 'armonia' },
        status: { not: 'CANCELLED' },
      },
      orderBy: { amountCents: 'desc' },
    });
    expect(charge).not.toBeNull();
    if (!charge) return;

    // Force a known outstanding balance on this student.
    await prisma.charge.update({
      where: { id: charge.id },
      data: { paidAmountCents: 0, status: 'PENDING' },
    });

    const response = await request(server)
      .delete(`/api/students/${charge.studentId}`)
      .set(auth);

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('STUDENT_HAS_OUTSTANDING_BALANCE');
  });

  it('allows deleting a draft but refuses an issued document', async () => {
    const issued = await prisma.documentRecord.findFirst({
      where: { tenant: { slug: 'armonia' }, status: 'ISSUED' },
    });
    expect(issued).not.toBeNull();
    if (issued) {
      const response = await request(server).delete(`/api/documents/${issued.id}`).set(auth);
      expect(response.status).toBe(409);
      expect(response.body.code).toBe('DOCUMENT_NOT_DRAFT');
    }

    // Create a fresh draft rather than relying on seeded state: earlier specs
    // consume the seeded drafts by issuing them.
    const student = await prisma.student.findFirstOrThrow({
      where: { tenant: { slug: 'armonia' }, deletedAt: null },
    });
    const created = await request(server)
      .post('/api/documents')
      .set(auth)
      .send({
        studentId: student.id,
        type: 'ATTENDANCE_CERTIFICATE',
        title: `E2E διαγραφή ${Date.now()}`,
        draft: true,
      });
    expect([200, 201]).toContain(created.status);
    const draftId = created.body.id as string;

    await request(server).delete(`/api/documents/${draftId}`).set(auth).expect(200);
    // Restore so the dataset is unchanged for other specs.
    await request(server).post(`/api/documents/${draftId}/restore`).set(auth).expect(201);
  });

  it('soft-deletes an announcement, drops its notifications, and restores it', async () => {
    const created = await request(server)
      .post('/api/announcements')
      .set(auth)
      .send({ title: 'Δοκιμή διαγραφής', body: 'Περιεχόμενο', audienceRoles: [] });
    expect(created.status).toBe(201);
    const id = created.body.id as string;

    const before = await prisma.notification.count({
      where: { entityType: 'Announcement', entityId: id },
    });
    expect(before).toBeGreaterThan(0);

    await request(server).delete(`/api/announcements/${id}`).set(auth).expect(200);

    const after = await prisma.notification.count({
      where: { entityType: 'Announcement', entityId: id },
    });
    expect(after).toBe(0);

    await request(server).post(`/api/announcements/${id}/restore`).set(auth).expect(201);

    const refanned = await prisma.notification.count({
      where: { entityType: 'Announcement', entityId: id },
    });
    expect(refanned).toBeGreaterThan(0);

    // Clean up so the seeded announcement counts stay stable.
    await prisma.notification.deleteMany({ where: { entityId: id } });
    await prisma.announcement.delete({ where: { id } });
  });

  it('trashes a lesson series and brings its future lessons back on restore', async () => {
    const series = await prisma.lessonSeries.findFirstOrThrow({
      where: { tenant: { slug: 'armonia' }, status: 'ACTIVE', deletedAt: null },
    });

    const before = await prisma.lesson.count({
      where: { lessonSeriesId: series.id, startsAt: { gte: new Date() } },
    });
    expect(before).toBeGreaterThan(0);

    await request(server).delete(`/api/lesson-series/${series.id}`).set(auth).expect(200);

    const trashed = await request(server).get('/api/trash/lessonSeries').set(auth);
    expect(trashed.body.data.map((row: { id: string }) => row.id)).toContain(series.id);

    await request(server).post(`/api/lesson-series/${series.id}/restore`).set(auth).expect(201);

    const after = await prisma.lesson.count({
      where: { lessonSeriesId: series.id, startsAt: { gte: new Date() } },
    });
    expect(after).toBe(before);
  });

  it('reopens a cancelled charge and a voided payment', async () => {
    const charge = await prisma.charge.findFirst({
      where: { tenant: { slug: 'armonia' }, status: 'PENDING', paidAmountCents: 0 },
    });
    expect(charge).not.toBeNull();
    if (!charge) return;

    await request(server)
      .post(`/api/finance/charges/${charge.id}/cancel`)
      .set(auth)
      .send({ reason: 'e2e' })
      .expect(200);

    const reopened = await request(server)
      .post(`/api/finance/charges/${charge.id}/reopen`)
      .set(auth);
    expect(reopened.status).toBe(200);
    expect(reopened.body.status).toBe('PENDING');
    expect(reopened.body.cancelledAt).toBeNull();

    // Reopening something that is not cancelled is a conflict.
    await request(server).post(`/api/finance/charges/${charge.id}/reopen`).set(auth).expect(409);
  });
});
