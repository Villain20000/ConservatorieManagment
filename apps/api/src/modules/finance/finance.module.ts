import { Module } from '@nestjs/common';
import { FinanceController } from './finance.controller.js';
import { FinanceScheduler } from './finance.scheduler.js';
import { FinanceService } from './finance.service.js';

@Module({
  controllers: [FinanceController],
  providers: [FinanceService, FinanceScheduler],
  exports: [FinanceService],
})
export class FinanceModule {}
