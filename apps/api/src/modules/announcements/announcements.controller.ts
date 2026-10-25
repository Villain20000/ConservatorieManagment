import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { NotificationsService } from '../../common/notifications.service.js';
import { PERMISSIONS } from '../../common/permissions.js';
import {
  AnnouncementQueryDto,
  CreateAnnouncementDto,
  NotificationQueryDto,
  UpdateAnnouncementDto,
} from './dto/announcements.dto.js';
import { AnnouncementsService } from './announcements.service.js';

@ApiTags('announcements')
@ApiBearerAuth()
@Controller('announcements')
export class AnnouncementsController {
  constructor(private readonly announcements: AnnouncementsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.ANNOUNCEMENTS_READ)
  list(@Query() query: AnnouncementQueryDto) {
    return this.announcements.list(query);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.ANNOUNCEMENTS_WRITE)
  create(@Body() dto: CreateAnnouncementDto) {
    return this.announcements.create(dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.ANNOUNCEMENTS_WRITE)
  update(@Param('id') id: string, @Body() dto: UpdateAnnouncementDto) {
    return this.announcements.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.ANNOUNCEMENTS_WRITE)
  remove(@Param('id') id: string) {
    return this.announcements.remove(id);
  }

  @Post(':id/restore')
  @RequirePermissions(PERMISSIONS.ANNOUNCEMENTS_WRITE)
  restore(@Param('id') id: string) {
    return this.announcements.restore(id);
  }
}

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@Query() query: NotificationQueryDto) {
    return this.notifications.listForCurrentUser({
      page: query.page,
      pageSize: query.pageSize,
      skip: query.skip,
      unreadOnly: query.unreadOnly,
    });
  }

  @Patch(':id/read')
  markRead(@Param('id') id: string) {
    return this.notifications.markRead(id);
  }

  @Post('read-all')
  @HttpCode(200)
  markAllRead() {
    return this.notifications.markAllRead();
  }
}
