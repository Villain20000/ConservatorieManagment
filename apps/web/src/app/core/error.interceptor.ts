import type { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { catchError, throwError } from 'rxjs';
import { ToastService } from './toast.service';

const SILENT_ENDPOINTS = /\/auth\/(login|refresh|logout|me)$/;

export const errorInterceptor: HttpInterceptorFn = (request, next) => {
  const toast = inject(ToastService);
  const transloco = inject(TranslocoService);

  return next(request).pipe(
    catchError((error: HttpErrorResponse) => {
      if (!SILENT_ENDPOINTS.test(request.url)) {
        toast.error(extractMessage(error, transloco));
      }
      return throwError(() => error);
    }),
  );
};

function extractMessage(error: HttpErrorResponse, transloco: TranslocoService): string {
  if (error.status === 0) {
    return transloco.translate('errors.network');
  }
  if (error.status === 403) {
    return transloco.translate('errors.forbidden');
  }
  if (error.status === 429) {
    return transloco.translate('errors.tooMany');
  }
  if (error.status >= 500) {
    return transloco.translate('errors.server');
  }

  const body = error.error as { message?: string | string[] } | null;
  const message = body?.message;
  if (Array.isArray(message) && message.length) return message.join(' · ');
  if (typeof message === 'string' && message.trim()) return message;

  if (error.status === 404) return transloco.translate('errors.notFound');
  if (error.status === 401) return transloco.translate('errors.session');
  return transloco.translate('errors.generic');
}
