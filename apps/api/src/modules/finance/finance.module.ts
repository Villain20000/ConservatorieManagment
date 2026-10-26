import { Module } from '@nestjs/common';
import { FinanceController } from './finance.controller.js';
import { FinanceScheduler } from './finance.scheduler.js';
import { FinanceService } from './finance.service.js';
import { MyDataController } from './mydata/mydata.controller.js';
import { MyDataService } from './mydata/mydata.service.js';

@Module({
  controllers: [FinanceController, MyDataController],
  providers: [FinanceService, FinanceScheduler, MyDataService],
  exports: [FinanceService, MyDataService],
})
export class FinanceModule {}
