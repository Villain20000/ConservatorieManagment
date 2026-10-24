import type { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { AuthService } from './auth.service';

const AUTH_ENDPOINTS = /\/auth\/(login|refresh|logout)$/;

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const isApi = request.url.startsWith('/api');
  const isAuthCall = AUTH_ENDPOINTS.test(request.url);
  const token = auth.accessToken();

  const outgoing =
    isApi && !isAuthCall && token
      ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
      : request;

  return next(outgoing).pipe(
    catchError((error: { status?: number }) => {
      if (
        error.status === 401 &&
        isApi &&
        !isAuthCall &&
        !request.headers.has('X-Auth-Retry')
      ) {
        return from(auth.refreshAccessToken()).pipe(
          switchMap((newToken) => {
            if (!newToken) {
              const returnUrl = router.url;
              void router.navigate(['/login'], {
                queryParams: returnUrl.startsWith('/login') ? {} : { returnUrl },
              });
              return throwError(() => error);
            }
            return next(
              request.clone({
                setHeaders: {
                  Authorization: `Bearer ${newToken}`,
                  'X-Auth-Retry': '1',
                },
              }),
            );
          }),
        );
      }
      return throwError(() => error);
    }),
  );
};
