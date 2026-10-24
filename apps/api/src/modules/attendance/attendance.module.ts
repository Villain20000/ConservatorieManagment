import { Module } from '@nestjs/common';
import {
  AttendanceController,
  LessonAttendanceController,
} from './attendance.controller.js';
import { AttendanceService } from './attendance.service.js';

@Module({
  controllers: [LessonAttendanceController, AttendanceController],
  providers: [AttendanceService],
  exports: [AttendanceService],
})
export class AttendanceModule {}
