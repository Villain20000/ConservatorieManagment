import type { LoggerService, LogLevel } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { ClsService } from 'nestjs-cls';

type Level = 'fatal' | 'error' | 'warn' | 'log' | 'debug' | 'verbose';

const ORDER: Record<Level, number> = {
  fatal: 0,
  error: 1,
  warn: 2,
  log: 3,
  debug: 4,
  verbose: 5,
};

const DEFAULT_MIN: Level = 'log';

/**
 * One JSON object per line, with the request id pulled from CLS.
 *
 * Deliberately dependency-free: structured logs are a hard requirement for a
 * pilot, but adding pino/winston to a Nest app that already has a Logger facade
 * buys little. `LOG_FORMAT=console` falls back to Nest's default logger, so a
 * developer who wants readable output keeps it.
 */
export class JsonLogger implements LoggerService {
  private minLevel: number;

  constructor(
    private readonly cls: ClsService | null,
    config: ConfigService | null,
  ) {
    const configured = config?.get<string>('LOG_LEVEL') as Level | undefined;
    this.minLevel = ORDER[configured ?? DEFAULT_MIN] ?? ORDER[DEFAULT_MIN];
  }

  log(message: unknown, ...rest: unknown[]): void {
    this.write('log', message, rest);
  }

  error(message: unknown, ...rest: unknown[]): void {
    this.write('error', message, rest);
  }

  warn(message: unknown, ...rest: unknown[]): void {
    this.write('warn', message, rest);
  }

  debug(message: unknown, ...rest: unknown[]): void {
    this.write('debug', message, rest);
  }

  verbose(message: unknown, ...rest: unknown[]): void {
    this.write('verbose', message, rest);
  }

  fatal(message: unknown, ...rest: unknown[]): void {
    this.write('fatal', message, rest);
  }

  setLogLevels(levels: LogLevel[]): void {
    if (levels.length === 0) return;
    const lowest = levels
      .map((level) => ORDER[level as Level])
      .filter((value) => value !== undefined)
      .sort((a, b) => a - b)[0];
    if (lowest !== undefined) {
      this.minLevel = lowest;
    }
  }

  private write(level: Level, message: unknown, rest: unknown[]): void {
    if (ORDER[level] > this.minLevel) return;

    const context = this.contextOf(rest);
    const error = rest.find((value) => value instanceof Error) as Error | undefined;
    const record: Record<string, unknown> = {
      ts: new Date().toISOString(),
      level,
      msg: this.render(message),
      ...(context ? { ctx: context } : {}),
      ...this.requestContext(),
      ...(error ? { err: { name: error.name, message: error.message, stack: error.stack } } : {}),
    };

    process.stdout.write(`${JSON.stringify(record)}\n`);
  }

  /**
   * Nest passes the context (a class name) as the final string argument. Any
   * other trailing string is treated as part of the message.
   */
  private contextOf(rest: unknown[]): string | undefined {
    for (let index = rest.length - 1; index >= 0; index -= 1) {
      const value = rest[index];
      if (typeof value === 'string' && /^[A-Z][\w.]*$/.test(value)) {
        return value;
      }
    }
    return undefined;
  }

  private render(message: unknown): string {
    if (typeof message === 'string') return message;
    if (message instanceof Error) return message.message;
    try {
      return JSON.stringify(message);
    } catch {
      return String(message);
    }
  }

  /** Never throws: a logger that crashes the request is worse than a missing field. */
  private requestContext(): Record<string, unknown> {
    if (!this.cls) return {};
    try {
      if (!this.cls.isActive()) return {};
      const user = this.cls.get<{ userId?: string; tenantId?: string }>('user');
      const req = this.cls.get<{ method?: string; path?: string }>('req');
      return {
        requestId: this.cls.getId(),
        ...(user?.userId ? { userId: user.userId } : {}),
        ...(user?.tenantId ? { tenantId: user.tenantId } : {}),
        ...(req?.method ? { method: req.method } : {}),
        ...(req?.path ? { path: req.path } : {}),
      };
    } catch {
      return {};
    }
  }
}
