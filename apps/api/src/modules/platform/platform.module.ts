import { Module } from '@nestjs/common';
import { PlatformController } from './platform.controller.js';
import { PlatformService } from './platform.service.js';
import { SubscriptionBillingController } from './subscription-billing.controller.js';
import { SubscriptionBillingService } from './subscription-billing.service.js';
import { SupportAccessController } from './support-access.controller.js';
import { SupportAccessService } from './support-access.service.js';
import { TenantSupportAccessController } from './tenant-support-access.controller.js';

@Module({
  controllers: [
    PlatformController,
    SupportAccessController,
    TenantSupportAccessController,
    SubscriptionBillingController,
  ],
  providers: [
    PlatformService,
    SupportAccessService,
    SubscriptionBillingService,
  ],
  exports: [
    PlatformService,
    SubscriptionBillingService,
  ],
})
export class PlatformModule {}
