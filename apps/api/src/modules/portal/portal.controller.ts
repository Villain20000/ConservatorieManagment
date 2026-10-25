import { Controller, Get, Param, Query, Res, StreamableFile } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { RequiresFeature } from '../../common/decorators/require-feature.decorator.js';
import { PERMISSIONS } from '../../common/permissions.js';
import { setPdfHeaders } from '../documents/documents.controller.js';
import {
  PortalAttendanceQueryDto,
  PortalScheduleQueryDto,
  PortalStudentQueryDto,
} from './dto/portal.dto.js';
import { PortalService } from './portal.service.js';

@ApiTags('portal')
@ApiBearerAuth()
@RequiresFeature('portals')
@Controller('portal')
@RequirePermissions(PERMISSIONS.PORTAL_READ)
export class PortalController {
  constructor(private readonly portal: PortalService) {}

  @Get('children')
  children() {
    return this.portal.children();
  }

  @Get('me')
  profile(@Query() query: PortalStudentQueryDto) {
    return this.portal.profile(query.studentId);
  }

  @Get('overview')
  overview(@Query() query: PortalStudentQueryDto) {
    return this.portal.overview(query.studentId);
  }

  @Get('schedule')
  schedule(@Query() query: PortalScheduleQueryDto) {
    return this.portal.schedule(query);
  }

  @Get('attendance')
  attendance(@Query() query: PortalAttendanceQueryDto) {
    return this.portal.attendance(query);
  }

  @Get('results')
  results(@Query() query: PortalStudentQueryDto) {
    return this.portal.results(query.studentId);
  }

  @Get('finance')
  finance(@Query() query: PortalStudentQueryDto) {
    return this.portal.finance(query.studentId);
  }

  @Get('documents')
  documents(@Query() query: PortalStudentQueryDto) {
    return this.portal.documents(query.studentId);
  }

  @Get('assignments')
  assignments(@Query() query: PortalStudentQueryDto) {
    return this.portal.assignments(query.studentId);
  }

  @Get('documents/:id/pdf')
  async documentPdf(
    @Param('id') id: string,
    @Query() query: PortalStudentQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { buffer, fileName } = await this.portal.documentPdf(id, query.studentId);
    setPdfHeaders(res, fileName, buffer.length);
    return new StreamableFile(buffer);
  }
}
