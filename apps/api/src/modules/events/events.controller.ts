import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { PERMISSIONS } from '../../common/permissions.js';
import { CreateEventDto } from './dto/create-event.dto.js';
import { CreatePerformanceDto } from './dto/create-performance.dto.js';
import { EventCheckinDto } from './dto/event-checkin.dto.js';
import { EventQueryDto } from './dto/event-query.dto.js';
import { RegisterAttendeeDto } from './dto/register-attendee.dto.js';
import { ReorderPerformancesDto } from './dto/reorder-performances.dto.js';
import { UpdateEventDto } from './dto/update-event.dto.js';
import { EventsService } from './events.service.js';

@ApiTags('events')
@ApiBearerAuth()
@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.EVENTS_READ)
  listEvents(@Query() query: EventQueryDto) {
    return this.events.listEvents(query);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.EVENTS_READ)
  getEvent(@Param('id') id: string) {
    return this.events.getEvent(id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.EVENTS_WRITE)
  createEvent(@Body() dto: CreateEventDto) {
    return this.events.createEvent(dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.EVENTS_WRITE)
  updateEvent(@Param('id') id: string, @Body() dto: UpdateEventDto) {
    return this.events.updateEvent(id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.EVENTS_WRITE)
  deleteEvent(@Param('id') id: string) {
    return this.events.deleteEvent(id);
  }

  @Post(':id/performances')
  @RequirePermissions(PERMISSIONS.EVENTS_CURATE)
  addPerformance(
    @Param('id') eventId: string,
    @Body() dto: CreatePerformanceDto,
  ) {
    return this.events.addPerformance(eventId, dto);
  }

  @Delete(':id/performances/:performanceId')
  @RequirePermissions(PERMISSIONS.EVENTS_CURATE)
  removePerformance(
    @Param('id') eventId: string,
    @Param('performanceId') performanceId: string,
  ) {
    return this.events.removePerformance(eventId, performanceId);
  }

  @Put(':id/performances/reorder')
  @RequirePermissions(PERMISSIONS.EVENTS_CURATE)
  reorderPerformances(
    @Param('id') eventId: string,
    @Body() dto: ReorderPerformancesDto,
  ) {
    return this.events.reorderPerformances(eventId, dto);
  }

  @Post(':id/registrations')
  @RequirePermissions(PERMISSIONS.EVENTS_READ)
  registerAttendee(
    @Param('id') eventId: string,
    @Body() dto: RegisterAttendeeDto,
  ) {
    return this.events.registerAttendee(eventId, dto);
  }

  @Post(':id/checkin')
  @RequirePermissions(PERMISSIONS.EVENTS_CHECKIN)
  checkinTicket(
    @Param('id') eventId: string,
    @Body() dto: EventCheckinDto,
  ) {
    return this.events.checkinTicket(eventId, dto);
  }

  @Get(':id/program')
  @RequirePermissions(PERMISSIONS.EVENTS_READ)
  getProgram(@Param('id') eventId: string) {
    return this.events.getProgram(eventId);
  }
}
