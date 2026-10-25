import { Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { PERMISSIONS } from '../../common/permissions.js';
import { TenantContextService } from '../../common/tenant-context.service.js';
import { SupportAccessService } from './support-access.service.js';

@ApiTags('settings')
@ApiBearerAuth()
@Controller('settings/support-access')
@RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
export class TenantSupportAccessController {
  constructor(
    private readonly service: SupportAccessService,
    private readonly tenant: TenantContextService,
  ) {}

  @Get()
  list() {
    return this.service.listForTenant(this.tenant.tenantId);
  }

  @Post(':id/revoke')
  revoke(@Param('id') id: string) {
    return this.service.revokeForTenant(this.tenant.tenantId, id);
  }
}
