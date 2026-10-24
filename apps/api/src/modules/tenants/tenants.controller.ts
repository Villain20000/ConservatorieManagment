import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { PERMISSIONS } from '../../common/permissions.js';
import { CreateBranchDto, UpdateBranchDto, UpdateTenantDto } from './dto/tenant.dto.js';
import { TenantsService } from './tenants.service.js';

@ApiTags('tenant')
@ApiBearerAuth()
@Controller('tenant')
export class TenantsController {
  constructor(private readonly tenants: TenantsService) {}

  @Get()
  getTenant() {
    return this.tenants.getTenant();
  }

  @Patch('settings')
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  updateTenant(@Body() dto: UpdateTenantDto) {
    return this.tenants.updateTenant(dto);
  }

  @Get('branches')
  @RequirePermissions(PERMISSIONS.ACADEMICS_READ)
  listBranches() {
    return this.tenants.listBranches();
  }

  @Post('branches')
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  createBranch(@Body() dto: CreateBranchDto) {
    return this.tenants.createBranch(dto);
  }

  @Patch('branches/:id')
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  updateBranch(@Param('id') id: string, @Body() dto: UpdateBranchDto) {
    return this.tenants.updateBranch(id, dto);
  }

  @Delete('branches/:id')
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  removeBranch(@Param('id') id: string) {
    return this.tenants.removeBranch(id);
  }
}
