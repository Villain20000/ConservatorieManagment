import { Injectable, Logger } from '@nestjs/common';

export interface ErrorContext {
  requestId?: string;
  path?: string;
  method?: string;
  userId?: string;
  tenantId?: string;
}

export interface ErrorReporter {
  capture(exception: unknown, context: ErrorContext): void;
}

export const ERROR_REPORTER = 'ERROR_REPORTER';

/**
 * Default sink: write the exception through the structured logger.
 *
 * This exists so that swapping in Sentry (or any hosted tracker) later is a
 * one-provider change rather than a hunt through every catch block. Nothing in
 * the codebase should call a vendor SDK directly.
 */
@Injectable()
export class LogErrorReporter implements ErrorReporter {
  private readonly logger = new Logger('ErrorReporter');

  capture(exception: unknown, context: ErrorContext): void {
    const error = exception instanceof Error ? exception : new Error(String(exception));
    this.logger.error(
      {
        message: error.message,
        stack: error.stack,
        ...context,
      },
      error.stack,
    );
  }
}

/** Used in tests and in environments where error capture is intentionally off. */
@Injectable()
export class NoopErrorReporter implements ErrorReporter {
  capture(): void {
    // intentionally empty
  }
}
