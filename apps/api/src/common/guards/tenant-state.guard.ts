import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ClsService } from 'nestjs-cls';
import { EntitlementsService } from '../entitlements.service.js';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import type { TenantAccess } from '../entitlements.types.js';
import { TenantContextService } from '../tenant-context.service.js';

/** Read-only verbs that stay available to a trial-expired tenant. */
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Enforces `Tenant.status` / trial expiry on every authenticated tenant route.
 *
 * Runs after `JwtAuthGuard` (it needs the CLS tenant) and before
 * `FeatureGuard` (a suspended tenant should read as "suspended" rather than as
 * "feature missing").
 *
 * Uses `EntitlementsService.access()` — one query, memoised on CLS — rather than
 * `snapshot()`, whose usage counts are not needed to decide access and would
 * otherwise run on every authenticated request.
 */
@Injectable()
export class TenantStateGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly entitlements: EntitlementsService,
    private readonly tenantContext: TenantContextService,
    private readonly cls: ClsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    // Platform-admin sessions carry no tenant; there is no plan to consult.
    const tenantId = this.tenantContext.tenantIdOrNull;
    if (!tenantId) {
      return true;
    }

    const access = await this.entitlements.access(tenantId);
    this.cls.set<TenantAccess>('entitlements', access);

    if (access.state === 'SUSPENDED') {
      throw new ForbiddenException({ code: 'TENANT_SUSPENDED' });
    }

    if (access.state === 'TRIAL_EXPIRED') {
      const method = context
        .switchToHttp()
        .getRequest<{ method?: string }>()
        .method?.toUpperCase();

      if (!method || !READ_METHODS.has(method)) {
        throw new ForbiddenException({ code: 'TRIAL_EXPIRED' });
      }
    }

    return true;
  }
}
