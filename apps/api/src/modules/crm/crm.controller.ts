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
import { LeadStage } from '../../generated/prisma/enums.js';
import { CrmService } from './crm.service.js';
import { ConvertLeadDto } from './dto/convert-lead.dto.js';
import { CreateActivityDto } from './dto/create-activity.dto.js';
import { CreateLeadDto } from './dto/create-lead.dto.js';
import { LeadQueryDto } from './dto/lead-query.dto.js';
import { UpdateLeadDto } from './dto/update-lead.dto.js';

class ChangeStageDto {
  stage!: LeadStage;
  body?: string;
}

@ApiTags('crm')
@ApiBearerAuth()
@Controller('crm/leads')
export class CrmController {
  constructor(private readonly crm: CrmService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.CRM_READ)
  listLeads(@Query() query: LeadQueryDto) {
    return this.crm.listLeads(query);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.CRM_READ)
  getLead(@Param('id') id: string) {
    return this.crm.getLead(id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CRM_WRITE)
  createLead(@Body() dto: CreateLeadDto) {
    return this.crm.createLead(dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.CRM_WRITE)
  updateLead(@Param('id') id: string, @Body() dto: UpdateLeadDto) {
    return this.crm.updateLead(id, dto);
  }

  @Patch(':id/stage')
  @RequirePermissions(PERMISSIONS.CRM_WRITE)
  changeStage(@Param('id') id: string, @Body() body: ChangeStageDto) {
    return this.crm.changeStage(id, body.stage, body.body);
  }

  @Post(':id/activities')
  @RequirePermissions(PERMISSIONS.CRM_WRITE)
  addActivity(@Param('id') id: string, @Body() dto: CreateActivityDto) {
    return this.crm.addActivity(id, dto);
  }

  @Post(':id/convert')
  @RequirePermissions(PERMISSIONS.CRM_WRITE)
  convertLead(@Param('id') id: string, @Body() dto: ConvertLeadDto) {
    return this.crm.convertLead(id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.CRM_WRITE)
  deleteLead(@Param('id') id: string) {
    return this.crm.deleteLead(id);
  }
}
