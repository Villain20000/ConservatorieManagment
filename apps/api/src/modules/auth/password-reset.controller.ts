import { Body, Controller, Get, HttpCode, Post, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator.js';
import {
  ConfirmPasswordResetDto,
  RequestPasswordResetDto,
} from './dto/password-reset.dto.js';
import { PasswordResetService } from './password-reset.service.js';

@ApiTags('auth')
@Controller('auth/password-reset')
export class PasswordResetController {
  constructor(private readonly service: PasswordResetService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 900_000 } })
  @Post('request')
  @HttpCode(202)
  request(@Body() dto: RequestPasswordResetDto, @Req() req: Request) {
    return this.service.request(dto, req.ip);
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 900_000 } })
  @Get('validate')
  validate(@Query('token') token?: string) {
    if (!token) return { valid: false };
    return this.service.validate(token);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 900_000 } })
  @Post('confirm')
  @HttpCode(200)
  confirm(@Body() dto: ConfirmPasswordResetDto) {
    return this.service.confirm(dto);
  }
}
