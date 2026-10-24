import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { PERMISSIONS } from '../../common/permissions.js';
import {
  CancelLessonDto,
  ConflictCheckDto,
  CreateLessonSeriesDto,
  LessonQueryDto,
  RescheduleLessonDto,
  SeriesQueryDto,
  UpdateLessonSeriesDto,
} from './dto/scheduling.dto.js';
import { SchedulingService } from './scheduling.service.js';

@ApiTags('schedule')
@ApiBearerAuth()
@Controller('schedule')
export class ScheduleController {
  constructor(private readonly scheduling: SchedulingService) {}

  @Get('options')
  @RequirePermissions(PERMISSIONS.SCHEDULE_READ)
  options() {
    return this.scheduling.options();
  }

  @Post('conflicts')
  @RequirePermissions(PERMISSIONS.SCHEDULE_READ)
  conflicts(@Body() dto: ConflictCheckDto) {
    return this.scheduling.checkConflicts(dto);
  }
}

@ApiTags('lesson-series')
@ApiBearerAuth()
@Controller('lesson-series')
export class LessonSeriesController {
  constructor(private readonly scheduling: SchedulingService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.SCHEDULE_READ)
  list(@Query() query: SeriesQueryDto) {
    return this.scheduling.listSeries(query);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.SCHEDULE_READ)
  get(@Param('id') id: string) {
    return this.scheduling.getSeries(id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.SCHEDULE_WRITE)
  create(@Body() dto: CreateLessonSeriesDto) {
    return this.scheduling.createSeries(dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.SCHEDULE_WRITE)
  update(@Param('id') id: string, @Body() dto: UpdateLessonSeriesDto) {
    return this.scheduling.updateSeries(id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.SCHEDULE_WRITE)
  end(@Param('id') id: string) {
    return this.scheduling.endSeries(id);
  }
}

@ApiTags('lessons')
@ApiBearerAuth()
@Controller('lessons')
export class LessonsController {
  constructor(private readonly scheduling: SchedulingService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.SCHEDULE_READ)
  list(@Query() query: LessonQueryDto) {
    return this.scheduling.listLessons(query);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.SCHEDULE_READ)
  get(@Param('id') id: string) {
    return this.scheduling.getLesson(id);
  }

  @Patch(':id/reschedule')
  @RequirePermissions(PERMISSIONS.SCHEDULE_WRITE)
  reschedule(@Param('id') id: string, @Body() dto: RescheduleLessonDto) {
    return this.scheduling.rescheduleLesson(id, dto);
  }

  @Patch(':id/cancel')
  @RequirePermissions(PERMISSIONS.SCHEDULE_WRITE)
  cancel(@Param('id') id: string, @Body() dto: CancelLessonDto) {
    return this.scheduling.cancelLesson(id, dto);
  }
}
