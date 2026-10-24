import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { PERMISSIONS } from '../../common/permissions.js';
import {
  AttendanceQueryDto,
  LessonNoteDto,
  SaveAttendanceDto,
} from './dto/attendance.dto.js';
import { AttendanceService } from './attendance.service.js';

@ApiTags('attendance')
@ApiBearerAuth()
@Controller('lessons')
export class LessonAttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @Get(':id/attendance')
  @RequirePermissions(PERMISSIONS.ATTENDANCE_READ)
  getRoster(@Param('id') id: string) {
    return this.attendance.getRoster(id);
  }

  @Put(':id/attendance')
  @RequirePermissions(PERMISSIONS.ATTENDANCE_WRITE)
  save(@Param('id') id: string, @Body() dto: SaveAttendanceDto) {
    return this.attendance.saveAttendance(id, dto);
  }

  @Post(':id/notes')
  @RequirePermissions(PERMISSIONS.ATTENDANCE_WRITE)
  addNote(@Param('id') id: string, @Body() dto: LessonNoteDto) {
    return this.attendance.addNote(id, dto);
  }

  @Delete(':id/notes/:noteId')
  @RequirePermissions(PERMISSIONS.ATTENDANCE_WRITE)
  removeNote(@Param('id') id: string, @Param('noteId') noteId: string) {
    return this.attendance.removeNote(id, noteId);
  }
}

@ApiTags('attendance')
@ApiBearerAuth()
@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.ATTENDANCE_READ)
  list(@Query() query: AttendanceQueryDto) {
    return this.attendance.listAttendance(query);
  }

  @Get('summary')
  @RequirePermissions(PERMISSIONS.ATTENDANCE_READ)
  summary(@Query('studentId') studentId: string) {
    return this.attendance.attendanceSummary(studentId);
  }
}
