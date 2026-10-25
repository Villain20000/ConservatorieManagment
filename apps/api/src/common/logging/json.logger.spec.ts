import type { ConfigService } from '@nestjs/config';
import type { ClsService } from 'nestjs-cls';
import type { MockInstance } from 'vitest';
import { JsonLogger } from './json.logger.js';

interface LogRecord {
  ts?: string;
  level?: string;
  msg?: string;
  ctx?: string;
  requestId?: string;
  userId?: string;
  tenantId?: string;
  method?: string;
  path?: string;
  err?: { name?: string; message?: string; stack?: string };
  [key: string]: unknown;
}

/**
 * A deliberately tiny CLS stand-in. The logger only ever calls `isActive()`,
 * `getId()` and `get()`, so there is no reason to boot a real CLS context.
 */
function fakeCls(overrides: Partial<ClsService> = {}): ClsService {
  return {
    isActive: () => false,
    getId: () => undefined,
    get: () => undefined,
    ...overrides,
  } as unknown as ClsService;
}

function requestScopedCls(): ClsService {
  const store: Record<string, unknown> = {
    user: { userId: 'user-1', tenantId: 'tenant-1' },
    req: { method: 'GET', path: '/api/students?pageSize=1' },
  };

  return fakeCls({
    isActive: () => true,
    getId: () => 'req-abc-123',
    get: ((key: string) => store[key]) as unknown as ClsService['get'],
  });
}

function createLogger(cls: ClsService | null = null): JsonLogger {
  return new JsonLogger(cls, null as unknown as ConfigService);
}

let writeSpy: MockInstance<typeof process.stdout.write>;

beforeEach(() => {
  writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
});

afterEach(() => {
  writeSpy.mockRestore();
});

function output(): string {
  return writeSpy.mock.calls.map((call) => String(call[0])).join('');
}

function lines(): string[] {
  return output()
    .split('\n')
    .filter((line) => line.length > 0);
}

function records(): LogRecord[] {
  return lines().map((line) => JSON.parse(line) as LogRecord);
}

describe('JsonLogger', () => {
  it('writes exactly one parseable JSON line per call', () => {
    const logger = createLogger();

    logger.log('first');
    logger.warn('second');

    const emitted = lines();
    expect(emitted).toHaveLength(2);
    for (const line of emitted) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
    // One line per call: two newline-terminated writes, not one blob.
    expect(output().match(/\n/g)).toHaveLength(2);
    expect(output().endsWith('\n')).toBe(true);
  });

  it('includes ts, level and msg on every record', () => {
    const logger = createLogger();

    logger.log('hello');

    const [record] = records();
    expect(record.level).toBe('log');
    expect(record.msg).toBe('hello');
    expect(record.ts).toEqual(expect.any(String));
    expect(Number.isNaN(Date.parse(record.ts as string))).toBe(false);
  });

  it('adds the request fields when CLS is active', () => {
    const logger = createLogger(requestScopedCls());

    logger.log('with context');

    const [record] = records();
    expect(record).toMatchObject({
      requestId: 'req-abc-123',
      userId: 'user-1',
      tenantId: 'tenant-1',
      method: 'GET',
      path: '/api/students?pageSize=1',
    });
  });

  it('omits the request fields when CLS is inactive', () => {
    const logger = createLogger(fakeCls());

    logger.log('no context');

    const [record] = records();
    expect(record).not.toHaveProperty('requestId');
    expect(record).not.toHaveProperty('userId');
    expect(record).not.toHaveProperty('tenantId');
    expect(record).not.toHaveProperty('method');
    expect(record).not.toHaveProperty('path');
    expect(record.msg).toBe('no context');
  });

  it('never throws when CLS blows up', () => {
    const logger = createLogger(
      fakeCls({
        isActive: () => {
          throw new Error('no active context');
        },
      }),
    );

    expect(() => logger.log('still logged')).not.toThrow();
    expect(records()).toHaveLength(1);
    expect(records()[0]).not.toHaveProperty('requestId');
  });

  it('never throws when CLS reports active but reading it fails', () => {
    const logger = createLogger(
      fakeCls({
        isActive: () => true,
        getId: () => {
          throw new Error('context torn down mid-request');
        },
      }),
    );

    expect(() => logger.error('still logged')).not.toThrow();
    expect(records()).toHaveLength(1);
  });

  it('attaches an err object when an Error accompanies the message', () => {
    const logger = createLogger();
    const error = new Error('boom');

    logger.error('request failed', error);

    const [record] = records();
    expect(record.msg).toBe('request failed');
    expect(record.err).toEqual({
      name: 'Error',
      message: 'boom',
      stack: expect.any(String),
    });
  });

  it('renders an Error passed as the message without throwing', () => {
    // `write()` only looks for an Error among the trailing arguments, so an
    // Error handed in as the message is rendered into `msg` instead of `err`.
    const logger = createLogger();

    expect(() => logger.error(new Error('boom'))).not.toThrow();
    expect(records()).toHaveLength(1);
    expect(records()[0].msg).toBe('boom');
  });

  it('suppresses levels below the configured minimum', () => {
    const logger = createLogger();

    logger.setLogLevels(['error']);
    logger.log('hidden log');
    logger.debug('hidden debug');
    logger.verbose('hidden verbose');
    logger.error('visible error');

    const emitted = records();
    expect(emitted).toHaveLength(1);
    expect(emitted[0].level).toBe('error');
    expect(emitted[0].msg).toBe('visible error');
  });

  it('does not throw on a circular message', () => {
    const logger = createLogger();
    const circular: Record<string, unknown> = { name: 'loop' };
    circular.self = circular;

    expect(() => logger.log(circular)).not.toThrow();
    expect(records()).toHaveLength(1);
    expect(records()[0].msg).toEqual(expect.any(String));
  });
});
