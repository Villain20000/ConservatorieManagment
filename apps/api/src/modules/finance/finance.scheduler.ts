import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { FinanceService } from './finance.service.js';

@Injectable()
export class FinanceScheduler {
  private readonly logger = new Logger(FinanceScheduler.name);

  constructor(
    private readonly config: ConfigService,
    private readonly finance: FinanceService,
  ) {}

  @Cron('0 5 * * *', { timeZone: 'Europe/Athens' })
  async overdueSweep(): Promise<void> {
    if (this.config.get<string>('SCHEDULER_ENABLED') === 'false') return;
    try {
      const result = await this.finance.sweepOverdue();
      this.logger.log(
        `Overdue sweep: ${result.updated} charges updated, ${result.notified} notifications`,
      );
    } catch (error) {
      this.logger.error(`Overdue sweep failed: ${String(error)}`);
    }
  }
}
