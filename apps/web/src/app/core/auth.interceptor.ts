import type { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { AuthService } from './auth.service';

const AUTH_ENDPOINTS = /\/auth\/(login|refresh|logout)$/;

/**
 * The support grant header belongs only to tenant APIs. The API rejects it on
 * platform, auth, health and docs endpoints, so the client must never attach it
 * there (the platform grant endpoints stay usable while support is active).
 */
function isTenantApi(url: string): boolean {
  return (
    url.startsWith('/api') &&
    !url.startsWith('/api/auth') &&
    !url.startsWith('/api/platform') &&
    !url.startsWith('/api/health') &&
    !url.startsWith('/api/docs')
  );
}

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const apiCall = request.url.startsWith('/api');
  const isAuthCall = AUTH_ENDPOINTS.test(request.url);
  const token = auth.accessToken();
  const support = auth.support();
  const attachSupport = Boolean(support) && isTenantApi(request.url);

  const headers: Record<string, string> = {};
  if (apiCall && !isAuthCall && token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (support && attachSupport) {
    headers['X-Support-Grant'] = support.grant.id;
  }

  const outgoing = Object.keys(headers).length
    ? request.clone({ setHeaders: headers })
    : request;

  return next(outgoing).pipe(
    catchError((error: { status?: number }) => {
      if (
        error.status === 401 &&
        apiCall &&
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

            // Retry from the original request so a refreshed tenant call still
            // carries the support grant. Read the grant again: refresh may have
            // ended support mode (for example when the grant expired).
            const retrySupport = auth.support();
            const retryHeaders: Record<string, string> = {
              Authorization: `Bearer ${newToken}`,
              'X-Auth-Retry': '1',
            };
            if (retrySupport && isTenantApi(request.url)) {
              retryHeaders['X-Support-Grant'] = retrySupport.grant.id;
            }
            return next(request.clone({ setHeaders: retryHeaders }));
          }),
        );
      }
      return throwError(() => error);
    }),
  );
};
