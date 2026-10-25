import { inject } from '@angular/core';
import type { ActivatedRouteSnapshot, CanActivateFn, RouterStateSnapshot } from '@angular/router';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';
import type { Permission, Role } from './models';

export function homeRouteFor(auth: AuthService): string {
  if (auth.isSupportSession()) return '/app/dashboard';
  if (!auth.isTenantUser() && auth.isPlatformAdmin()) return '/platform';
  return '/app/dashboard';
}

export const authGuard: CanActivateFn = (
  _route: ActivatedRouteSnapshot,
  state: RouterStateSnapshot,
) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.isAuthenticated()) {
    return router.createUrlTree(['/login'], {
      queryParams: { returnUrl: state.url },
    });
  }
  if (!auth.isTenantUser() && !auth.isSupportSession()) {
    return router.createUrlTree([auth.isPlatformAdmin() ? '/platform' : '/login']);
  }
  return true;
};

export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.isAuthenticated() && !auth.requiresTenantSelection()) {
    return router.createUrlTree([homeRouteFor(auth)]);
  }
  return true;
};

export const platformGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.isAuthenticated()) {
    return router.createUrlTree(['/login'], { queryParams: { returnUrl: '/platform' } });
  }
  if (!auth.has('platform.manage')) {
    return router.createUrlTree([homeRouteFor(auth)]);
  }
  return true;
};

export function permissionGuard(...permissions: Permission[]): CanActivateFn {
  return () => {
    const auth = inject(AuthService);
    const router = inject(Router);
    if (!auth.isAuthenticated()) {
      return router.createUrlTree(['/login']);
    }
    if (!permissions.every((permission) => auth.has(permission))) {
      return router.createUrlTree([homeRouteFor(auth)]);
    }
    return true;
  };
}

export function roleGuard(...roles: Role[]): CanActivateFn {
  return () => {
    const auth = inject(AuthService);
    const router = inject(Router);
    const role = auth.role();
    if (!role || !roles.includes(role)) {
      return router.createUrlTree([homeRouteFor(auth)]);
    }
    return true;
  };
}

export const rootGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.isAuthenticated()) {
    return router.createUrlTree(['/login']);
  }
  return router.createUrlTree([homeRouteFor(auth)]);
};
