import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';

const PASSWORD = 'MusicOS2026!';
const RANDOM_ID = '00000000-0000-4000-8000-000000000000';

describe('Finance API (e2e)', () => {
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
    expect(response.body.data.length).toBeGreaterThan(0);
    return response.body.data[0].id as string;
  }

  it('requires authentication for the finance overview', async () => {
    await request(server).get('/api/finance/overview').expect(401);
  });

  it('denies students the finance overview (FINANCE_READ)', async () => {
    const token = await login('student@armonia.test');
    await request(server)
      .get('/api/finance/overview')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('returns a finance overview with totals for directors', async () => {
    const token = await login('director@armonia.test');
    const response = await request(server)
      .get('/api/finance/overview')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.totals).toMatchObject({
      billedCents: expect.any(Number),
      collectedCents: expect.any(Number),
      outstandingCents: expect.any(Number),
    });
    expect(Array.isArray(response.body.monthly)).toBe(true);
    expect(Array.isArray(response.body.recentPayments)).toBe(true);
  });

  it('lists seeded charges, payments, plans and scholarships', async () => {
    const token = await login('director@armonia.test');
    for (const path of [
      '/api/finance/charges',
      '/api/finance/payments',
      '/api/finance/installment-plans',
      '/api/finance/scholarships',
    ]) {
      const response = await request(server)
        .get(path)
        .set('Authorization', `Bearer ${token}`);
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);
    }
  });

  it('runs a full charge -> payment -> void -> cancel lifecycle', async () => {
    const token = await login('director@armonia.test');
    const auth = { Authorization: `Bearer ${token}` };
    const studentId = await firstStudentId(token);

    const charge = await request(server)
      .post('/api/finance/charges')
      .set(auth)
      .send({
        studentId,
        description: `E2E δίδακτρα ${Date.now()}`,
        period: '2026-11',
        amountCents: 10000,
        dueDate: '2026-11-30',
      });
    expect([200, 201]).toContain(charge.status);
    expect(charge.body.id).toEqual(expect.any(String));
    const chargeId = charge.body.id as string;

    const payment = await request(server)
      .post('/api/finance/payments')
      .set(auth)
      .send({
        studentId,
        amountCents: 10000,
        method: 'BANK_TRANSFER',
        reference: `E2E-${Date.now()}`,
        allocations: [{ chargeId, amountCents: 10000 }],
      });
    expect([200, 201]).toContain(payment.status);
    const paymentId = payment.body.id as string;

    const settled = await request(server)
      .get(`/api/finance/charges?studentId=${studentId}`)
      .set(auth);
    expect(settled.status).toBe(200);
    const settledCharge = (settled.body.data as any[]).find((row) => row.id === chargeId);
    expect(settledCharge?.status).toBe('PAID');

    const voided = await request(server)
      .post(`/api/finance/payments/${paymentId}/void`)
      .set(auth)
      .send({ reason: 'E2E ακύρωση λανθασμένης καταχώρισης' });
    expect(voided.status).toBe(200);

    const cancelled = await request(server)
      .post(`/api/finance/charges/${chargeId}/cancel`)
      .set(auth)
      .send({ reason: 'E2E ακύρωση ελέγχου' });
    expect(cancelled.status).toBe(200);
  });

  it('creates and approves a scholarship, then exposes the student ledger', async () => {
    const token = await login('director@armonia.test');
    const auth = { Authorization: `Bearer ${token}` };
    const studentId = await firstStudentId(token);

    const created = await request(server)
      .post('/api/finance/scholarships')
      .set(auth)
      .send({
        studentId,
        type: 'PERCENTAGE',
        percentage: 25,
        reason: 'E2E υποτροφία ελέγχου',
        validFrom: '2026-01-01',
      });
    expect([200, 201]).toContain(created.status);
    const scholarshipId = created.body.id as string;

    const decided = await request(server)
      .patch(`/api/finance/scholarships/${scholarshipId}`)
      .set(auth)
      .send({ status: 'APPROVED' });
    expect(decided.status).toBe(200);
    expect(decided.body.status).toBe('APPROVED');

    const ledger = await request(server)
      .get(`/api/finance/students/${studentId}/ledger`)
      .set(auth);
    expect(ledger.status).toBe(200);
  });

  it('creates and cancels an installment plan', async () => {
    const token = await login('director@armonia.test');
    const auth = { Authorization: `Bearer ${token}` };
    const studentId = await firstStudentId(token);

    const created = await request(server)
      .post('/api/finance/installment-plans')
      .set(auth)
      .send({
        studentId,
        description: `E2E διακανονισμός ${Date.now()}`,
        totalAmountCents: 30000,
        count: 3,
        startDate: '2026-11-01',
      });
    expect([200, 201]).toContain(created.status);

    const cancelled = await request(server)
      .post(`/api/finance/installment-plans/${created.body.id}/cancel`)
      .set(auth)
      .send({ reason: 'E2E ακύρωση διακανονισμού' });
    expect(cancelled.status).toBe(200);
  });

  it('rejects charges for unknown students and voids without a reason', async () => {
    const token = await login('director@armonia.test');
    const auth = { Authorization: `Bearer ${token}` };

    await request(server)
      .post('/api/finance/charges')
      .set(auth)
      .send({
        studentId: RANDOM_ID,
        description: 'Ανύπαρκτος μαθητής',
        amountCents: 1000,
        dueDate: '2026-11-30',
      })
      .expect(404);

    const payments = await request(server)
      .get('/api/finance/payments?pageSize=1')
      .set(auth);
    expect(payments.status).toBe(200);
    const paymentId = payments.body.data[0].id as string;
    await request(server)
      .post(`/api/finance/payments/${paymentId}/void`)
      .set(auth)
      .send({ reason: 'x' })
      .expect(400);
  });

  it('serves a payment receipt PDF for a posted payment', async () => {
    const token = await login('director@armonia.test');
    const auth = { Authorization: `Bearer ${token}` };

    const payments = await request(server)
      .get('/api/finance/payments?pageSize=50')
      .set(auth);
    expect(payments.status).toBe(200);
    const posted = (payments.body.data as any[]).find((row) => row.status === 'POSTED');
    expect(posted).toBeDefined();

    const pdf = await request(server)
      .get(`/api/finance/payments/${posted.id}/receipt.pdf`)
      .set(auth);
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toContain('application/pdf');
  });
});
