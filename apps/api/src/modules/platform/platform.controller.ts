import { Controller, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { PERMISSIONS } from '../../common/permissions.js';
import { PlatformService } from './platform.service.js';

@ApiTags('platform')
@ApiBearerAuth()
@Controller('platform')
export class PlatformController {
  constructor(private readonly platform: PlatformService) {}

  @Get('overview')
  @RequirePermissions(PERMISSIONS.PLATFORM_MANAGE)
  overview() {
    return this.platform.overview();
  }

  @Get('tenants')
  @RequirePermissions(PERMISSIONS.PLATFORM_MANAGE)
  tenants() {
    return this.platform.listTenants();
  }

  @Get('tenants/:id')
  @RequirePermissions(PERMISSIONS.PLATFORM_MANAGE)
  tenant(@Param('id') id: string) {
    return this.platform.getTenant(id);
  }
}
