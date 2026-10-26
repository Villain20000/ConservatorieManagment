import {
  Body,
  Controller,
  Get,
  Ip,
  Param,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator.js';
import { PERMISSIONS } from '../../../common/permissions.js';
import {
  CreateSignatureRequestDto,
  SignDocumentDto,
  SignatureWebhookDto,
} from './dto/signature.dto.js';
import { SignaturesService } from './signatures.service.js';

@ApiTags('signatures')
@Controller('documents/signatures')
export class SignaturesController {
  constructor(private readonly signatures: SignaturesService) {}

  @Post('request')
  @ApiBearerAuth()
  @RequirePermissions(PERMISSIONS.SIGNATURES_MANAGE)
  createRequest(@Body() dto: CreateSignatureRequestDto) {
    return this.signatures.createSignatureRequest(dto);
  }

  @Post('sign/:token')
  signDocument(
    @Param('token') token: string,
    @Body() dto?: SignDocumentDto,
    @Ip() ip?: string,
  ) {
    return this.signatures.verifyAndSign(token, dto, ip);
  }

  @Get('status/:id')
  @ApiBearerAuth()
  @RequirePermissions(PERMISSIONS.DOCUMENTS_READ)
  getStatus(@Param('id') id: string) {
    return this.signatures.getSignatureStatus(id);
  }

  @Post('webhook')
  processWebhook(@Body() dto: SignatureWebhookDto) {
    return this.signatures.processWebhook(dto);
  }
}
