import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../../database/prisma.service.js';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import { PLATFORM_PERMISSIONS, ROLE_PERMISSIONS } from '../permissions.js';
import type { RequestUser, Role } from '../types/request-user.js';

interface AccessTokenPayload {
  sub: string;
  email: string;
  adm?: boolean;
  tid?: string;
  mid?: string;
  role?: Role;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | undefined>; user?: RequestUser }>();
    const authorization = request.headers['authorization'];
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : undefined;

    if (!token) {
      throw new UnauthorizedException('Απαιτείται σύνδεση');
    }

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<AccessTokenPayload>(token);
    } catch {
      throw new UnauthorizedException('Η συνεδρία έληξε ή δεν είναι έγκυρη');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { memberships: true },
    });

    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Ο λογαριασμός δεν είναι ενεργός');
    }

    let membership = payload.tid
      ? user.memberships.find((m) => m.tenantId === payload.tid && m.isActive)
      : undefined;

    if (!membership && payload.tid) {
      throw new UnauthorizedException('Η πρόσβαση στο ωδείο δεν είναι πλέον ενεργή');
    }

    if (!membership && !user.isPlatformAdmin) {
      throw new UnauthorizedException('Δεν υπάρχει ενεργό ωδείο για τη συνεδρία');
    }

    const requestUser: RequestUser = {
      userId: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      isPlatformAdmin: user.isPlatformAdmin,
      permissions: membership
        ? [...(ROLE_PERMISSIONS[membership.role] ?? [])]
        : [...PLATFORM_PERMISSIONS],
      ...(membership
        ? {
            tenantId: membership.tenantId,
            membershipId: membership.id,
            branchId: membership.branchId,
            role: membership.role as Role,
          }
        : {}),
    };

    request.user = requestUser;
    this.cls.set('user', requestUser);
    if (requestUser.tenantId) {
      this.cls.set('tenantId', requestUser.tenantId);
    }

    return true;
  }
}
