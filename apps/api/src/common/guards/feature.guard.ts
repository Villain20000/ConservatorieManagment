import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { EntitlementsService } from '../entitlements.service.js';
import { FEATURE_KEY } from '../decorators/require-feature.decorator.js';
import type { FeatureKey } from '../entitlements.types.js';
import { TenantContextService } from '../tenant-context.service.js';

/**
 * Blocks routes annotated with `@RequiresFeature(...)` when the tenant's plan
 * does not include that module.
 *
 * Runs after `JwtAuthGuard` (it needs the CLS tenant) and after
 * `TenantStateGuard` (a suspended tenant should read as "suspended", not as
 * "feature missing").
 */
@Injectable()
export class FeatureGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly entitlements: EntitlementsService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const feature = this.reflector.getAllAndOverride<FeatureKey | undefined>(FEATURE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!feature) {
      return true;
    }

    // Platform-admin sessions carry no tenant; there is no plan to consult.
    const tenantId = this.tenantContext.tenantIdOrNull;
    if (!tenantId) {
      return true;
    }

    await this.entitlements.requireFeature(tenantId, feature);
    return true;
  }
}
