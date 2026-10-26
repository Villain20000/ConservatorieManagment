import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { PERMISSIONS } from '../../common/permissions.js';
import { AssetQueryDto } from './dto/asset-query.dto.js';
import { CheckoutLoanDto } from './dto/checkout-loan.dto.js';
import { CreateAssetDto } from './dto/create-asset.dto.js';
import { CreateMaintenanceDto } from './dto/create-maintenance.dto.js';
import { ReturnLoanDto } from './dto/return-loan.dto.js';
import { UpdateAssetDto } from './dto/update-asset.dto.js';
import { InventoryService } from './inventory.service.js';

@ApiTags('inventory')
@ApiBearerAuth()
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get('assets')
  @RequirePermissions(PERMISSIONS.INVENTORY_READ)
  listAssets(@Query() query: AssetQueryDto) {
    return this.inventory.listAssets(query);
  }

  @Get('assets/:id')
  @RequirePermissions(PERMISSIONS.INVENTORY_READ)
  getAsset(@Param('id') id: string) {
    return this.inventory.getAsset(id);
  }

  @Post('assets')
  @RequirePermissions(PERMISSIONS.INVENTORY_WRITE)
  createAsset(@Body() dto: CreateAssetDto) {
    return this.inventory.createAsset(dto);
  }

  @Patch('assets/:id')
  @RequirePermissions(PERMISSIONS.INVENTORY_WRITE)
  updateAsset(@Param('id') id: string, @Body() dto: UpdateAssetDto) {
    return this.inventory.updateAsset(id, dto);
  }

  @Delete('assets/:id')
  @RequirePermissions(PERMISSIONS.INVENTORY_WRITE)
  deleteAsset(@Param('id') id: string) {
    return this.inventory.deleteAsset(id);
  }

  @Post('loans')
  @RequirePermissions(PERMISSIONS.INVENTORY_LOAN)
  checkoutLoan(@Body() dto: CheckoutLoanDto) {
    return this.inventory.checkoutLoan(dto);
  }

  @Post('loans/:id/return')
  @RequirePermissions(PERMISSIONS.INVENTORY_LOAN)
  returnLoan(@Param('id') loanId: string, @Body() dto: ReturnLoanDto) {
    return this.inventory.returnLoan(loanId, dto);
  }

  @Post('maintenance')
  @RequirePermissions(PERMISSIONS.INVENTORY_MAINTAIN)
  logMaintenance(@Body() dto: CreateMaintenanceDto) {
    return this.inventory.logMaintenance(dto);
  }

  @Get('alerts/tuning')
  @RequirePermissions(PERMISSIONS.INVENTORY_READ)
  getTuningAlerts() {
    return this.inventory.getTuningAlerts();
  }
}
