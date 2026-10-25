import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { AllowMfaPending } from '../../common/decorators/allow-mfa-pending.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import {
  ActivateMfaDto,
  DisableMfaDto,
  RegenerateRecoveryCodesDto,
  VerifyMfaDto,
} from './dto/mfa.dto.js';
import { MfaService } from './mfa.service.js';

@ApiTags('auth')
@Controller('auth/mfa')
export class MfaController {
  constructor(private readonly mfaService: MfaService) {}

  /**
   * The second leg of login. Public by necessity: the caller holds a challenge
   * token, not an access token.
   */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('verify')
  @HttpCode(200)
  verify(
    @Body() dto: VerifyMfaDto,
    @Res({ passthrough: true }) response: Response,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.mfaService.verifyChallenge(dto, response, userAgent);
  }

  @ApiBearerAuth()
  @AllowMfaPending()
  @Get('status')
  status() {
    return this.mfaService.status();
  }

  @ApiBearerAuth()
  @AllowMfaPending()
  @Post('enroll')
  @HttpCode(200)
  enroll() {
    return this.mfaService.beginEnrolment();
  }

  @ApiBearerAuth()
  @AllowMfaPending()
  @Post('activate')
  @HttpCode(200)
  activate(@Body() dto: ActivateMfaDto) {
    return this.mfaService.activate(dto);
  }

  @ApiBearerAuth()
  @AllowMfaPending()
  @Post('disable')
  @HttpCode(200)
  disable(@Body() dto: DisableMfaDto) {
    return this.mfaService.disable(dto);
  }

  @ApiBearerAuth()
  @AllowMfaPending()
  @Post('recovery-codes/regenerate')
  @HttpCode(200)
  regenerateRecoveryCodes(@Body() dto: RegenerateRecoveryCodesDto) {
    return this.mfaService.regenerateRecoveryCodes(dto);
  }
}
