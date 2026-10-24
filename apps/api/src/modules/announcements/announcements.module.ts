import { Module } from '@nestjs/common';
import {
  AnnouncementsController,
  NotificationsController,
} from './announcements.controller.js';
import { AnnouncementsService } from './announcements.service.js';

@Module({
  controllers: [AnnouncementsController, NotificationsController],
  providers: [AnnouncementsService],
})
export class AnnouncementsModule {}
