import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';

/**
 * Observability contract for the pilot. The liveness payload in particular is
 * polled by the Playwright harness, so its shape is treated as frozen.
 */
describe('Observability (e2e)', () => {
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

  it('keeps the liveness payload byte-compatible with the Playwright harness', async () => {
    const response = await request(server).get('/api/health');

    expect(response.status).toBe(200);
    // toEqual, not toMatchObject: an extra or missing field is a breaking change.
    expect(response.body).toEqual({
      status: 'ok',
      service: 'musicos-api',
      timestamp: expect.any(String),
    });
    expect(Number.isNaN(Date.parse(response.body.timestamp as string))).toBe(false);
  });

  it('reports readiness with a live database check', async () => {
    const response = await request(server).get('/api/health/ready');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
    expect(response.body.checks.database.ok).toBe(true);
    expect(typeof response.body.checks.database.latencyMs).toBe('number');
    expect(response.body.checks.database.latencyMs).toBeGreaterThanOrEqual(0);
    expect(response.body.checks.outbox).toBeDefined();
    expect(Number.isNaN(Date.parse(response.body.timestamp as string))).toBe(false);
  });

  it('stamps every response with an x-request-id header', async () => {
    const health = await request(server).get('/api/health');
    expect(health.status).toBe(200);
    expect(health.headers['x-request-id']).toEqual(expect.any(String));
    expect((health.headers['x-request-id'] as string).length).toBeGreaterThan(0);

    // Also on the error path, where correlation matters most.
    const unauthenticated = await request(server).get('/api/dashboard');
    expect(unauthenticated.status).toBe(401);
    expect(unauthenticated.headers['x-request-id']).toEqual(expect.any(String));
  });

  it('echoes an inbound x-request-id unchanged', async () => {
    const response = await request(server)
      .get('/api/health')
      .set('x-request-id', 'test-correlation-123');

    expect(response.status).toBe(200);
    expect(response.headers['x-request-id']).toBe('test-correlation-123');
  });

  it('puts the correlation id in 4xx bodies as well as the header', async () => {
    // `/api/dashboard` is guarded; no token means the auth guard throws 401.
    const response = await request(server).get('/api/dashboard');

    expect(response.status).toBe(401);
    expect(response.headers['x-request-id']).toEqual(expect.any(String));
    expect(response.body.requestId).toBe(response.headers['x-request-id']);
    expect(response.body.statusCode).toBe(401);
  });

  it('echoes the client-supplied correlation id in a 4xx body', async () => {
    const response = await request(server)
      .get('/api/dashboard')
      .set('x-request-id', 'test-correlation-123');

    expect(response.status).toBe(401);
    expect(response.headers['x-request-id']).toBe('test-correlation-123');
    expect(response.body.requestId).toBe('test-correlation-123');
  });

  it('rejects an unauthenticated protected route without leaking a 500', async () => {
    const response = await request(server).get('/api/students');

    expect(response.status).toBe(401);
    expect(response.headers['x-request-id']).toEqual(expect.any(String));
    expect(response.body.requestId).toBeDefined();
  });
});
