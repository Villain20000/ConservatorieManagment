import { Body, Controller, Get, HttpCode, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { PERMISSIONS } from '../../common/permissions.js';
import {
  CreateExamApplicationDto,
  CreateExamDto,
  CreateExamPeriodDto,
  DecideExamApplicationDto,
  ExamQueryDto,
  SaveExamResultsDto,
  SetCommitteeDto,
  UpdateExamDto,
} from './dto/exams.dto.js';
import { ExamsService } from './exams.service.js';

@ApiTags('exams')
@ApiBearerAuth()
@Controller('exams')
export class ExamsController {
  constructor(private readonly exams: ExamsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.EXAMS_READ)
  list(@Query() query: ExamQueryDto) {
    return this.exams.list(query);
  }

  @Get('periods')
  @RequirePermissions(PERMISSIONS.EXAMS_READ)
  periods() {
    return this.exams.listPeriods();
  }

  @Post('periods')
  @RequirePermissions(PERMISSIONS.EXAMS_WRITE)
  createPeriod(@Body() dto: CreateExamPeriodDto) {
    return this.exams.createPeriod(dto);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.EXAMS_WRITE)
  create(@Body() dto: CreateExamDto) {
    return this.exams.create(dto);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.EXAMS_READ)
  get(@Param('id') id: string) {
    return this.exams.get(id);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.EXAMS_WRITE)
  update(@Param('id') id: string, @Body() dto: UpdateExamDto) {
    return this.exams.update(id, dto);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.EXAMS_WRITE)
  cancel(@Param('id') id: string) {
    return this.exams.cancel(id);
  }

  @Get(':id/committee')
  @RequirePermissions(PERMISSIONS.EXAMS_READ)
  committee(@Param('id') id: string) {
    return this.exams.committee(id);
  }

  @Put(':id/committee')
  @RequirePermissions(PERMISSIONS.EXAMS_WRITE)
  setCommittee(@Param('id') id: string, @Body() dto: SetCommitteeDto) {
    return this.exams.setCommittee(id, dto);
  }

  @Get(':id/applications')
  @RequirePermissions(PERMISSIONS.EXAMS_READ)
  applications(@Param('id') id: string) {
    return this.exams.applications(id);
  }

  @Post(':id/applications')
  @RequirePermissions(PERMISSIONS.EXAMS_WRITE)
  apply(@Param('id') id: string, @Body() dto: CreateExamApplicationDto) {
    return this.exams.apply(id, dto);
  }

  @Patch(':id/applications/:applicationId')
  @RequirePermissions(PERMISSIONS.EXAMS_WRITE)
  decideApplication(
    @Param('id') id: string,
    @Param('applicationId') applicationId: string,
    @Body() dto: DecideExamApplicationDto,
  ) {
    return this.exams.decideApplication(id, applicationId, dto);
  }

  @Get(':id/results')
  @RequirePermissions(PERMISSIONS.EXAMS_READ)
  results(@Param('id') id: string) {
    return this.exams.resultRoster(id);
  }

  @Put(':id/results')
  @RequirePermissions(PERMISSIONS.EXAMS_GRADE)
  saveResults(@Param('id') id: string, @Body() dto: SaveExamResultsDto) {
    return this.exams.saveResults(id, dto);
  }

  @Post(':id/results/submit')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.EXAMS_GRADE)
  submitResults(@Param('id') id: string) {
    return this.exams.submitResults(id);
  }

  @Post(':id/results/approve')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.EXAMS_APPROVE)
  approveResults(@Param('id') id: string) {
    return this.exams.approveResults(id);
  }

  @Post(':id/publish')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.EXAMS_APPROVE)
  publish(@Param('id') id: string) {
    return this.exams.publish(id);
  }

  @Post(':id/minutes')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.EXAMS_WRITE)
  minutes(@Param('id') id: string) {
    return this.exams.minutes(id);
  }
}

@ApiTags('exams')
@ApiBearerAuth()
@Controller('students')
export class StudentExamsController {
  constructor(private readonly exams: ExamsService) {}

  @Get(':id/exam-results')
  @RequirePermissions(PERMISSIONS.EXAMS_READ)
  results(@Param('id') id: string) {
    return this.exams.studentResults(id);
  }
}
