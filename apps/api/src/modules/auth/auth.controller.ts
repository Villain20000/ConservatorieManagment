import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import type { RequestUser } from '../../common/types/request-user.js';
import { AuthService, REFRESH_COOKIE_NAME } from './auth.service.js';
import {
  ChangePasswordDto,
  LoginDto,
  RefreshDto,
  SelectTenantDto,
} from './dto/auth.dto.js';

type CookieRequest = Request & { cookies?: Record<string, string | undefined> };

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.authService.login(dto, response, userAgent);
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(200)
  refresh(
    @Body() dto: RefreshDto,
    @Req() request: CookieRequest,
    @Res({ passthrough: true }) response: Response,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.authService.refresh(
      dto,
      request.cookies?.[REFRESH_COOKIE_NAME],
      response,
      userAgent,
    );
  }

  @Public()
  @Post('logout')
  @HttpCode(200)
  logout(@Req() request: CookieRequest, @Res({ passthrough: true }) response: Response) {
    return this.authService.logout(request.cookies?.[REFRESH_COOKIE_NAME], response);
  }

  @ApiBearerAuth()
  @Get('me')
  me(@CurrentUser() user: RequestUser) {
    return this.authService.getSession(user.userId, user.tenantId);
  }

  @ApiBearerAuth()
  @Post('select-tenant')
  @HttpCode(200)
  selectTenant(@CurrentUser() user: RequestUser, @Body() dto: SelectTenantDto) {
    return this.authService.selectTenant(user.userId, dto);
  }

  @ApiBearerAuth()
  @Post('change-password')
  @HttpCode(200)
  changePassword(
    @CurrentUser() user: RequestUser,
    @Body() dto: ChangePasswordDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.authService.changePassword(user.userId, dto, response);
  }
}
