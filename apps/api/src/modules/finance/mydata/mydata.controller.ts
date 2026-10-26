import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator.js';
import { PERMISSIONS } from '../../../common/permissions.js';
import {
  CancelTransmissionDto,
  MyDataQueryDto,
  TransmitPaymentDto,
} from './dto/mydata.dto.js';
import { MyDataService } from './mydata.service.js';

@ApiTags('mydata')
@ApiBearerAuth()
@Controller('finance/mydata')
export class MyDataController {
  constructor(private readonly mydata: MyDataService) {}

  @Post('transmit/:paymentId')
  @RequirePermissions(PERMISSIONS.FINANCE_WRITE)
  transmitPayment(
    @Param('paymentId') paymentId: string,
    @Body() dto?: TransmitPaymentDto,
  ) {
    return this.mydata.transmitPayment(paymentId, dto);
  }

  @Get('transmissions')
  @RequirePermissions(PERMISSIONS.FINANCE_READ)
  listTransmissions(@Query() query: MyDataQueryDto) {
    return this.mydata.listTransmissions(query);
  }

  @Get('transmissions/:id')
  @RequirePermissions(PERMISSIONS.FINANCE_READ)
  getTransmission(@Param('id') id: string) {
    return this.mydata.getTransmission(id);
  }

  @Post('transmissions/:id/cancel')
  @RequirePermissions(PERMISSIONS.FINANCE_WRITE)
  cancelTransmission(
    @Param('id') id: string,
    @Body() dto: CancelTransmissionDto,
  ) {
    return this.mydata.cancelTransmission(id, dto);
  }

  @Get('verify/:mark')
  @RequirePermissions(PERMISSIONS.FINANCE_READ)
  verifyMark(@Param('mark') mark: string) {
    return this.mydata.verifyMark(mark);
  }
}
