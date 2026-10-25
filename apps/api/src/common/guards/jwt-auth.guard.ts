import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../../database/prisma.service.js';
import { ALLOW_MFA_PENDING_KEY } from '../decorators/allow-mfa-pending.decorator.js';
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
  /** `'mfa'` marks a short-lived second-factor challenge, never an access token. */
  typ?: string;
  /** Set when enforcement is on but the account has not enrolled yet. */
  mfaPending?: boolean;
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

    // An MFA challenge is signed with the same secret as an access token. Without
    // this check it would be accepted as a full session, defeating the second
    // factor entirely. This is the single most important line in the MFA change.
    if (payload.typ === 'mfa') {
      throw new UnauthorizedException('Η συνεδρία δεν είναι έγκυρη');
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
      mfaEnabled: user.mfaEnabledAt !== null,
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

    // Enforcement is staged: an unenrolled privileged user still authenticates,
    // but every route except enrolment/profile/logout is closed to them.
    if (payload.mfaPending) {
      const allowPending = this.reflector.getAllAndOverride<boolean>(ALLOW_MFA_PENDING_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);

      if (!allowPending) {
        requestUser.mfaPendingEnrolment = true;
        this.cls.set('user', requestUser);
        throw new ForbiddenException({
          code: 'MFA_ENROLMENT_REQUIRED',
          message: 'Απαιτείται ενεργοποίηση ελέγχου ταυτότητας δύο παραγόντων',
        });
      }
    }

    return true;
  }
}
