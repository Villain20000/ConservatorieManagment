import {
  Body,
  Controller,
  Get,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { PERMISSIONS } from '../../common/permissions.js';
import {
  LogPracticeSessionDto,
  PracticeQueryDto,
} from './dto/practice.dto.js';
import { PracticeService } from './practice.service.js';

@ApiTags('practice')
@ApiBearerAuth()
@Controller('practice')
export class PracticeController {
  constructor(private readonly practice: PracticeService) {}

  @Post('sessions')
  @RequirePermissions(PERMISSIONS.PRACTICE_RECORD)
  logSession(@Body() dto: LogPracticeSessionDto) {
    return this.practice.logSession(dto);
  }

  @Get('sessions')
  @RequirePermissions(PERMISSIONS.PRACTICE_READ)
  listSessions(@Query() query: PracticeQueryDto) {
    return this.practice.listSessions(query);
  }

  @Get('analytics')
  @RequirePermissions(PERMISSIONS.PRACTICE_READ)
  getAnalytics(@Query('studentId') studentId?: string) {
    return this.practice.getAnalytics(studentId);
  }
}
