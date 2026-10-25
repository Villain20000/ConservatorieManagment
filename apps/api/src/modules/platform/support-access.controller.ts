import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { PERMISSIONS } from '../../common/permissions.js';
import {
  CreateSupportGrantDto,
  SupportGrantQueryDto,
} from './dto/support-access.dto.js';
import { SupportAccessService } from './support-access.service.js';

@ApiTags('platform')
@ApiBearerAuth()
@Controller('platform/support-grants')
@RequirePermissions(PERMISSIONS.PLATFORM_MANAGE)
export class SupportAccessController {
  constructor(private readonly service: SupportAccessService) {}

  @Post()
  create(@Body() dto: CreateSupportGrantDto) {
    return this.service.create(dto);
  }

  @Get()
  list(@Query() query: SupportGrantQueryDto) {
    return this.service.list(query);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Post(':id/revoke')
  revoke(@Param('id') id: string) {
    return this.service.revoke(id);
  }
}
