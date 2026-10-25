import { Module } from '@nestjs/common';
import { TenantLifecycleScheduler } from './tenant-lifecycle.scheduler.js';
import { TenantsController } from './tenants.controller.js';
import { TenantsService } from './tenants.service.js';

@Module({
  controllers: [TenantsController],
  providers: [TenantsService, TenantLifecycleScheduler],
})
export class TenantsModule {}
