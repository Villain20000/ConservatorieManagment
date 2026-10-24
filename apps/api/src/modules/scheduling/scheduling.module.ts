import { Module } from '@nestjs/common';
import {
  LessonSeriesController,
  LessonsController,
  ScheduleController,
} from './scheduling.controller.js';
import { SchedulingService } from './scheduling.service.js';

@Module({
  controllers: [ScheduleController, LessonSeriesController, LessonsController],
  providers: [SchedulingService],
  exports: [SchedulingService],
})
export class SchedulingModule {}
