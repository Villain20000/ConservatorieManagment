import { Global, Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { LogMailer, MAILER } from './mailer/log.mailer.js';
import { NumberingService } from './numbering/numbering.service.js';
import { OutboxProcessor } from './outbox/outbox.processor.js';
import { OutboxService } from './outbox/outbox.service.js';
import { PdfService } from './pdf/pdf.service.js';
import {
  LocalInvoiceProvider,
  LocalPaymentProvider,
  LocalSignatureProvider,
} from './providers/local.providers.js';
import { LocalDiskStorage, OBJECT_STORAGE } from './storage/local-disk.storage.js';

@Global()
@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [
    NumberingService,
    PdfService,
    OutboxService,
    OutboxProcessor,
    LocalPaymentProvider,
    LocalInvoiceProvider,
    LocalSignatureProvider,
    { provide: OBJECT_STORAGE, useClass: LocalDiskStorage },
    { provide: MAILER, useClass: LogMailer },
  ],
  exports: [
    NumberingService,
    PdfService,
    OutboxService,
    LocalPaymentProvider,
    LocalInvoiceProvider,
    LocalSignatureProvider,
    OBJECT_STORAGE,
    MAILER,
  ],
})
export class InfrastructureModule {}
