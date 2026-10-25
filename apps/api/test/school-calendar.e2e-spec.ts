import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma.service.js';

const PASSWORD = 'MusicOS2026!';

/**
 * End-to-end proof that the school calendar actually governs materialisation:
 * a holiday added through the API removes that date from a newly created weekly
 * series, and another tenant cannot see or delete the rule.
 */
describe('School calendar (e2e)', () => {
  let app: INestApplication;
  let server: Parameters<typeof request>[0];
  let prisma: PrismaService;
  let director: { Authorization: string };
  let melodiaDirector: { Authorization: string };
  let createdSeriesId: string | null = null;
  const createdCalendarIds: string[] = [];

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
    director = { Authorization: `Bearer ${login.body.accessToken}` };

    const loginB = await request(server)
      .post('/api/auth/login')
      .send({ email: 'director@melodia.test', password: PASSWORD });
    expect(loginB.status).toBe(200);
    melodiaDirector = { Authorization: `Bearer ${loginB.body.accessToken}` };
  });

  afterAll(async () => {
    const calendarIds = createdCalendarIds.slice();
    // Rows are removed directly so the shared seeded database stays tidy and the
    // soft-delete extension is bypassed for a hard cleanup.
    if (calendarIds.length > 0) {
      const where = { id: { in: calendarIds } };
      await prisma.calendarDay.deleteMany({ where });
    }
    if (createdSeriesId) {
      await prisma.lessonStudent.deleteMany({
        where: { lesson: { lessonSeriesId: createdSeriesId } },
      });
      await prisma.lesson.deleteMany({ where: { lessonSeriesId: createdSeriesId } });
      await prisma.lessonSeriesStudent.deleteMany({ where: { lessonSeriesId: createdSeriesId } });
      await prisma.lessonSeries.delete({ where: { id: createdSeriesId } });
    }
    await app.close();
  });

  /** A Monday far in the future so the series cannot collide with seeded data. */
  const MONDAY = '2031-01-06';
  const HOLIDAY = '2031-01-13'; // second Monday of the series

  it('skips a holiday when materialising a weekly series', async () => {
    const holiday = await request(server)
      .post('/api/schedule/calendar')
      .set(director)
      .send({ date: HOLIDAY, kind: 'HOLIDAY', name: 'E2E αργία' });
    expect(holiday.status).toBe(201);
    createdCalendarIds.push(holiday.body.id);

    const options = await request(server).get('/api/schedule/options').set(director);
    expect(options.status).toBe(200);
    const branch = options.body.branches[0] as { id: string };
    const room = (options.body.rooms as { id: string; branchId: string }[]).find(
      (row) => row.branchId === branch.id,
    );
    const teacher = options.body.teachers[0] as { id: string };
    const program = options.body.programs[0] as { id: string };
    expect(room).toBeDefined();

    const student = await prisma.student.findFirstOrThrow({
      where: { branchId: branch.id },
      select: { id: true },
    });

    const series = await request(server)
      .post('/api/lesson-series')
      .set(director)
      .send({
        branchId: branch.id,
        roomId: room!.id,
        teacherId: teacher.id,
        programId: program.id,
        type: 'INDIVIDUAL',
        title: 'E2E ημερολόγιο',
        weekday: 1,
        startTime: '07:15',
        durationMinutes: 30,
        validFrom: MONDAY,
        validTo: '2031-01-27',
        studentIds: [student.id],
      });
    expect(series.status).toBe(201);
    createdSeriesId = series.body.id;

    const lessons = await prisma.lesson.findMany({
      where: { lessonSeriesId: series.body.id },
      select: { startsAt: true },
      orderBy: { startsAt: 'asc' },
    });
    // 6, 13, 20, 27 Jan -> 13 Jan is the holiday, so three lessons remain.
    const dates = lessons.map((lesson) => lesson.startsAt.toISOString().slice(0, 10));
    expect(dates).toEqual(['2031-01-06', '2031-01-20', '2031-01-27']);
  });

  it('rejects a duplicate rule for the same date and scope', async () => {
    const duplicate = await request(server)
      .post('/api/schedule/calendar')
      .set(director)
      .send({ date: HOLIDAY, kind: 'HOLIDAY', name: 'E2E αργία' });
    expect(duplicate.status).toBe(409);
  });

  it('does not leak calendar rules across tenants', async () => {
    const otherTenant = await request(server).get('/api/schedule/calendar').set(melodiaDirector);
    expect(otherTenant.status).toBe(200);
    const names = (otherTenant.body.data as { name: string }[]).map((row) => row.name);
    expect(names).not.toContain('E2E αργία');

    const foreignDelete = await request(server)
      .delete(`/api/schedule/calendar/${createdCalendarIds[0]}`)
      .set(melodiaDirector);
    expect(foreignDelete.status).toBe(404);
  });

  it('validates the date format', async () => {
    const invalid = await request(server)
      .post('/api/schedule/calendar')
      .set(director)
      .send({ date: '31/12/2030', kind: 'HOLIDAY', name: 'Λάθος μορφή' });
    expect(invalid.status).toBe(400);
  });

  it('removes the rule again', async () => {
    const removed = await request(server)
      .delete(`/api/schedule/calendar/${createdCalendarIds[0]}`)
      .set(director);
    expect(removed.status).toBe(200);
    createdCalendarIds.length = 0;
  });
});
