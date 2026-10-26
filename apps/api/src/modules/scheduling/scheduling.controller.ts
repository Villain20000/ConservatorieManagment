import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { PERMISSIONS } from '../../common/permissions.js';
import {
  CalendarDayInputDto,
  CalendarDayQueryDto,
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

  @Get('calendar')
  @RequirePermissions(PERMISSIONS.SCHEDULE_READ)
  calendar(@Query() query: CalendarDayQueryDto) {
    return this.scheduling.listCalendarDays(query);
  }

  @Post('calendar')
  @RequirePermissions(PERMISSIONS.SCHEDULE_WRITE)
  createCalendarDay(@Body() dto: CalendarDayInputDto) {
    return this.scheduling.createCalendarDay(dto);
  }

  @Post('calendar/seed-greek')
  @RequirePermissions(PERMISSIONS.SCHEDULE_WRITE)
  seedGreekHolidays(@Body() body: { year?: number }) {
    return this.scheduling.seedGreekHolidays(body.year);
  }

  @Delete('calendar/:id')
  @RequirePermissions(PERMISSIONS.SCHEDULE_WRITE)
  removeCalendarDay(@Param('id') id: string) {
    return this.scheduling.removeCalendarDay(id);
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
  remove(@Param('id') id: string) {
    return this.scheduling.removeSeries(id);
  }

  /**
   * Explicit "finish this series" — the behaviour `DELETE` used to have.
   * Kept separate so deleting (recoverable) and ending (permanent) are not confused.
   */
  @Post(':id/end')
  @RequirePermissions(PERMISSIONS.SCHEDULE_WRITE)
  end(@Param('id') id: string) {
    return this.scheduling.endSeries(id);
  }

  @Post(':id/restore')
  @RequirePermissions(PERMISSIONS.SCHEDULE_WRITE)
  restore(@Param('id') id: string) {
    return this.scheduling.restoreSeries(id);
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
