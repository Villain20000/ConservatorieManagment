import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Inject,
  Logger,
  Optional,
} from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import type { Request, Response } from 'express';
import { ERROR_REPORTER, type ErrorReporter } from '../logging/error-reporter.js';

interface NestErrorBody {
  message?: string | string[];
  error?: string;
  code?: string;
  statusCode?: number;
  [key: string]: unknown;
}

/** Keys the filter owns; anything else on the exception payload is passed through. */
const RESERVED_KEYS = new Set(['message', 'error', 'code', 'statusCode']);

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(
    @Optional() private readonly cls?: ClsService,
    @Optional() @Inject(ERROR_REPORTER) private readonly reporter?: ErrorReporter,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    let message = 'Παρουσιάστηκε απρόσμενο σφάλμα';
    let errors: string[] | undefined;
    let code: string | undefined;
    let error = HttpStatus[status] ?? 'Error';
    const details: Record<string, unknown> = {};

    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else if (body && typeof body === 'object') {
        const typed = body as NestErrorBody;
        if (Array.isArray(typed.message)) {
          errors = typed.message;
          message = 'Η επικύρωση των δεδομένων απέτυχε';
        } else if (typeof typed.message === 'string') {
          message = typed.message;
        }
        if (typed.error) {
          error = typed.error;
        }
        code = typed.code;
        // Structured error context (feature, resource, limit, used, …) is part of
        // the contract: the web client renders seat limits from it.
        for (const [key, value] of Object.entries(typed)) {
          if (!RESERVED_KEYS.has(key) && value !== undefined) {
            details[key] = value;
          }
        }
      }
    }

    const requestId = this.requestId();

    // 5xx means something we did not anticipate: report it once, with the
    // correlation id, so it can be found in the logs or a hosted tracker.
    if (status >= 500) {
      this.reporter?.capture(exception, {
        requestId,
        path: request.url,
        method: request.method,
        userId: this.currentUser()?.userId,
        tenantId: this.currentUser()?.tenantId,
      });
    }

    response.status(status).json({
      statusCode: status,
      error,
      message,
      ...details,
      ...(errors ? { errors } : {}),
      ...(code ? { code } : {}),
      ...(requestId ? { requestId } : {}),
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }

  /** The filter runs inside the CLS context, but never let logging break a response. */
  private requestId(): string | undefined {
    try {
      return this.cls?.isActive() ? this.cls.getId() : undefined;
    } catch {
      return undefined;
    }
  }

  private currentUser(): { userId?: string; tenantId?: string } | undefined {
    try {
      return this.cls?.isActive()
        ? this.cls.get<{ userId?: string; tenantId?: string }>('user')
        : undefined;
    } catch {
      return undefined;
    }
  }
}
