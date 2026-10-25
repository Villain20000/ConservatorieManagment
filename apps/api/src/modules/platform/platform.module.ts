import { Module } from '@nestjs/common';
import { PlatformController } from './platform.controller.js';
import { PlatformService } from './platform.service.js';
import { SupportAccessController } from './support-access.controller.js';
import { SupportAccessService } from './support-access.service.js';
import { TenantSupportAccessController } from './tenant-support-access.controller.js';

@Module({
  controllers: [
    PlatformController,
    SupportAccessController,
    TenantSupportAccessController,
  ],
  providers: [PlatformService, SupportAccessService],
})
export class PlatformModule {}
