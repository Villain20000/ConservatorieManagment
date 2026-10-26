import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';

const PASSWORD = 'MusicOS2026!';

describe('Admissions CRM API (e2e)', () => {
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

  it('requires authentication for the CRM leads list', async () => {
    await request(server).get('/api/crm/leads').expect(401);
  });

  it('denies students and teachers CRM access (no CRM_READ)', async () => {
    for (const email of ['student@armonia.test', 'teacher@armonia.test']) {
      const token = await login(email);
      await request(server)
        .get('/api/crm/leads')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    }
  });

  it('allows directors and administrators to list leads', async () => {
    const token = await login('director@armonia.test');
    const response = await request(server)
      .get('/api/crm/leads')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.meta).toBeDefined();
  });

  it('executes full lead lifecycle: create -> activity -> stage change -> conversion -> isolation probe', async () => {
    const armoniaToken = await login('director@armonia.test');
    const armoniaAuth = { Authorization: `Bearer ${armoniaToken}` };

    // Get an existing branch and program in Armonia
    const academicsRes = await request(server).get('/api/academics/programs').set(armoniaAuth);
    expect(academicsRes.status).toBe(200);
    const programId = academicsRes.body[0]?.id;

    const profileRes = await request(server).get('/api/auth/me').set(armoniaAuth);
    const branchId = profileRes.body.branchId || profileRes.body.branches?.[0]?.id;

    // 1. Create Lead
    const createRes = await request(server)
      .post('/api/crm/leads')
      .set(armoniaAuth)
      .send({
        branchId,
        programId,
        studentFirstName: 'Αλέξανδρος',
        studentLastName: 'Ιωαννίδης',
        birthDate: '2016-04-12',
        contactName: 'Δημήτρης Ιωαννίδης',
        contactEmail: 'dimitris.ioannidis@example.com',
        contactPhone: '6944000111',
        relationship: 'Πατέρας',
        source: 'WEB_FORM',
        stage: 'NEW',
        notes: 'Ενδιαφέρον για κλασικό πιάνο',
      });

    expect(createRes.status).toBe(201);
    const leadId = createRes.body.id;
    expect(leadId).toBeDefined();
    expect(createRes.body.studentFirstName).toBe('Αλέξανδρος');

    // 2. Add Activity
    const activityRes = await request(server)
      .post(`/api/crm/leads/${leadId}/activities`)
      .set(armoniaAuth)
      .send({
        type: 'CALL',
        body: 'Τηλεφωνική επικοινωνία με τον πατέρα. Προγραμματίστηκε δοκιμαστικό μάθημα.',
        toStage: 'TRIAL_BOOKED',
      });
    expect(activityRes.status).toBe(201);
    expect(activityRes.body.type).toBe('CALL');

    // Verify lead stage updated
    const leadAfterTrial = await request(server)
      .get(`/api/crm/leads/${leadId}`)
      .set(armoniaAuth)
      .expect(200);
    expect(leadAfterTrial.body.stage).toBe('TRIAL_BOOKED');
    expect(leadAfterTrial.body.activities.length).toBeGreaterThanOrEqual(2);

    // 3. Move stage to OFFER_SENT
    await request(server)
      .patch(`/api/crm/leads/${leadId}/stage`)
      .set(armoniaAuth)
      .send({ stage: 'OFFER_SENT', body: 'Αποστολή προσφοράς διδάκτρων' })
      .expect(200);

    // 4. Strict Multi-Tenancy Isolation Check: Melodia director cannot see Armonia lead (must 404, never 403)
    const melodiaToken = await login('director@melodia.test');
    const melodiaAuth = { Authorization: `Bearer ${melodiaToken}` };

    await request(server)
      .get(`/api/crm/leads/${leadId}`)
      .set(melodiaAuth)
      .expect(404);

    await request(server)
      .patch(`/api/crm/leads/${leadId}/stage`)
      .set(melodiaAuth)
      .send({ stage: 'LOST' })
      .expect(404);

    // 5. Convert lead to Student
    const convertRes = await request(server)
      .post(`/api/crm/leads/${leadId}/convert`)
      .set(armoniaAuth)
      .send({
        programId,
      });

    expect(convertRes.status).toBe(201);
    expect(convertRes.body.student).toBeDefined();
    expect(convertRes.body.student.firstName).toBe('Αλέξανδρος');
    expect(convertRes.body.student.registrationNumber).toMatch(/^STU-\d{4}-\d{3}$/);
    expect(convertRes.body.enrollment).toBeDefined();
    expect(convertRes.body.lead.stage).toBe('ENROLLED');
    expect(convertRes.body.lead.convertedStudentId).toBe(convertRes.body.student.id);

    // 6. Duplicate conversion should fail
    await request(server)
      .post(`/api/crm/leads/${leadId}/convert`)
      .set(armoniaAuth)
      .send({ programId })
      .expect(409);

    // 7. Soft delete lead
    await request(server)
      .delete(`/api/crm/leads/${leadId}`)
      .set(armoniaAuth)
      .expect(200);

    // Verify it is now deleted from active list and direct get
    await request(server)
      .get(`/api/crm/leads/${leadId}`)
      .set(armoniaAuth)
      .expect(404);
  });
});
