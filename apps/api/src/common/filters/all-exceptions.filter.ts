import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

interface NestErrorBody {
  message?: string | string[];
  error?: string;
  code?: string;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

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
      }
    } else {
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    }

    response.status(status).json({
      statusCode: status,
      error,
      message,
      ...(errors ? { errors } : {}),
      ...(code ? { code } : {}),
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}
