import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { PERMISSIONS } from '../../common/permissions.js';
import { ChangeTenantPlanDto, SetTenantStatusDto } from './dto/platform.dto.js';
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

  @Patch('tenants/:id/status')
  @RequirePermissions(PERMISSIONS.PLATFORM_MANAGE)
  setStatus(@Param('id') id: string, @Body() dto: SetTenantStatusDto) {
    return this.platform.setTenantStatus(id, dto);
  }

  @Patch('tenants/:id/plan')
  @RequirePermissions(PERMISSIONS.PLATFORM_MANAGE)
  changePlan(@Param('id') id: string, @Body() dto: ChangeTenantPlanDto) {
    return this.platform.changeTenantPlan(id, dto.planCode);
  }

  @Get('outbox')
  @RequirePermissions(PERMISSIONS.PLATFORM_MANAGE)
  outbox(
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.platform.listOutbox(
      status,
      Math.max(1, Number(page) || 1),
      Math.min(100, Math.max(1, Number(pageSize) || 25)),
    );
  }

  @Post('outbox/:id/retry')
  @RequirePermissions(PERMISSIONS.PLATFORM_MANAGE)
  retryOutbox(@Param('id') id: string) {
    return this.platform.retryOutbox(id);
  }
}
