import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import type { Response } from 'express';
import { PrismaService } from '../../database/prisma.service.js';
import { ROLE_PERMISSIONS, PLATFORM_PERMISSIONS } from '../../common/permissions.js';
import type { Role } from '../../common/types/request-user.js';
import type { ChangePasswordDto, LoginDto, RefreshDto, SelectTenantDto } from './dto/auth.dto.js';

const REFRESH_COOKIE = 'musicos_refresh';
const ACCESS_TOKEN_TTL = '15m';

type MembershipWithTenant = Awaited<
  ReturnType<PrismaService['membership']['findMany']>
>[number] & {
  tenant: { id: string; name: string; slug: string; status: string };
};

export interface PublicUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  locale: string;
  isPlatformAdmin: boolean;
}

export interface MembershipSummary {
  id: string;
  tenantId: string;
  role: Role;
  branchId: string | null;
  tenant: { id: string; name: string; slug: string; status: string };
}

export interface SessionResult {
  accessToken: string;
  user: PublicUser;
  memberships: MembershipSummary[];
  activeTenant: MembershipSummary | null;
  permissions: string[];
  requiresTenantSelection: boolean;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async login(dto: LoginDto, response: Response, userAgent?: string): Promise<SessionResult> {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: {
        memberships: {
          where: { isActive: true },
          include: { tenant: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Λανθασμένα στοιχεία σύνδεσης');
    }

    const validPassword = await argon2.verify(user.passwordHash, dto.password);
    if (!validPassword) {
      throw new UnauthorizedException('Λανθασμένα στοιχεία σύνδεσης');
    }

    const memberships = user.memberships.map((membership) => this.toSummary(membership));

    if (memberships.length === 0 && !user.isPlatformAdmin) {
      throw new UnauthorizedException('Ο λογαριασμός δεν έχει πρόσβαση σε ενεργό ωδείο');
    }

    const activeMembership = memberships[0] ?? null;
    const accessToken = this.signAccessToken(user, activeMembership);
    const permissions = activeMembership
      ? [...(ROLE_PERMISSIONS[activeMembership.role] ?? [])]
      : [...PLATFORM_PERMISSIONS];

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    await this.createSession(user.id, response, userAgent);

    return {
      accessToken,
      user: this.toPublicUser(user),
      memberships,
      activeTenant: activeMembership,
      permissions,
      requiresTenantSelection: memberships.length > 1,
    };
  }

  async refresh(
    dto: RefreshDto,
    rawToken: string | undefined,
    response: Response,
    userAgent?: string,
  ): Promise<SessionResult> {
    if (!rawToken) {
      throw new UnauthorizedException('Δεν υπάρχει ενεργή συνεδρία');
    }

    const tokenHash = this.hashToken(rawToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: {
        user: {
          include: {
            memberships: {
              where: { isActive: true },
              include: { tenant: true },
              orderBy: { createdAt: 'asc' },
            },
          },
        },
      },
    });

    if (!stored) {
      throw new UnauthorizedException('Μη έγκυρη συνεδρία');
    }

    if (stored.revokedAt) {
      // A rotated token was replayed: invalidate the whole family.
      await this.prisma.refreshToken.updateMany({
        where: { userId: stored.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      this.clearCookie(response);
      throw new UnauthorizedException('Η συνεδρία ακυρώθηκε για λόγους ασφαλείας');
    }

    if (stored.expiresAt < new Date() || stored.user.status !== 'ACTIVE') {
      this.clearCookie(response);
      throw new UnauthorizedException('Η συνεδρία έληξε');
    }

    const memberships = stored.user.memberships.map((membership) => this.toSummary(membership));
    let activeMembership: MembershipSummary | null = null;

    if (dto.tenantId) {
      activeMembership = memberships.find((m) => m.tenantId === dto.tenantId) ?? null;
      if (!activeMembership) {
        throw new UnauthorizedException('Η πρόσβαση στο επιλεγμένο ωδείο δεν είναι ενεργή');
      }
    } else {
      activeMembership = memberships[0] ?? null;
    }

    if (!activeMembership && !stored.user.isPlatformAdmin) {
      throw new UnauthorizedException('Ο λογαριασμός δεν έχει πρόσβαση σε ενεργό ωδείο');
    }

    const accessToken = this.signAccessToken(stored.user, activeMembership);
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });
    await this.createSession(stored.userId, response, userAgent);

    return {
      accessToken,
      user: this.toPublicUser(stored.user),
      memberships,
      activeTenant: activeMembership,
      permissions: activeMembership
        ? [...(ROLE_PERMISSIONS[activeMembership.role] ?? [])]
        : [...PLATFORM_PERMISSIONS],
      requiresTenantSelection: false,
    };
  }

  async logout(rawToken: string | undefined, response: Response): Promise<{ success: true }> {
    if (rawToken) {
      await this.prisma.refreshToken.updateMany({
        where: { tokenHash: this.hashToken(rawToken), revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    this.clearCookie(response);
    return { success: true };
  }

  async selectTenant(userId: string, dto: SelectTenantDto): Promise<{
    accessToken: string;
    activeTenant: MembershipSummary;
    permissions: string[];
  }> {
    const membership = await this.prisma.membership.findFirst({
      where: { userId, tenantId: dto.tenantId, isActive: true },
      include: { tenant: true },
    });

    if (!membership) {
      throw new UnauthorizedException('Δεν έχετε πρόσβαση σε αυτό το ωδείο');
    }

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const summary = this.toSummary(membership);

    return {
      accessToken: this.signAccessToken(user, summary),
      activeTenant: summary,
      permissions: [...(ROLE_PERMISSIONS[membership.role] ?? [])],
    };
  }

  async changePassword(userId: string, dto: ChangePasswordDto, response: Response) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const validPassword = await argon2.verify(user.passwordHash, dto.currentPassword);

    if (!validPassword) {
      throw new UnauthorizedException('Ο τρέχων κωδικός δεν είναι σωστός');
    }

    const passwordHash = await this.hashPassword(dto.newPassword);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    this.clearCookie(response);
    this.logger.log(`Password changed for user ${userId}`);
    return { success: true, message: 'Ο κωδικός ενημερώθηκε. Συνδεθείτε ξανά.' };
  }

  async getSession(userId: string, activeTenantId?: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        memberships: {
          where: { isActive: true },
          include: { tenant: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    const memberships = user.memberships.map((membership) => this.toSummary(membership));
    const activeTenant =
      memberships.find((membership) => membership.tenantId === activeTenantId) ??
      memberships[0] ??
      null;

    return {
      user: this.toPublicUser(user),
      memberships,
      activeTenant,
      permissions: activeTenant
        ? [...(ROLE_PERMISSIONS[activeTenant.role] ?? [])]
        : [...PLATFORM_PERMISSIONS],
    };
  }

  async hashPassword(password: string): Promise<string> {
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
    });
  }

  private signAccessToken(
    user: { id: string; email: string; isPlatformAdmin: boolean },
    membership: MembershipSummary | null,
  ): string {
    return this.jwt.sign(
      {
        sub: user.id,
        email: user.email,
        adm: user.isPlatformAdmin,
        ...(membership
          ? {
              tid: membership.tenantId,
              mid: membership.id,
              role: membership.role,
            }
          : {}),
      },
      { expiresIn: ACCESS_TOKEN_TTL },
    );
  }

  private async createSession(userId: string, response: Response, userAgent?: string): Promise<void> {
    const rawToken = randomBytes(48).toString('base64url');
    const tokenHash = this.hashToken(rawToken);
    const days = Number(this.config.get<string>('REFRESH_TOKEN_DAYS') ?? 7);
    const expiresAt = new Date(Date.now() + days * 86_400_000);

    await this.prisma.refreshToken.create({
      data: { userId, tokenHash, expiresAt, userAgent: userAgent ?? null },
    });

    response.cookie(REFRESH_COOKIE, rawToken, {
      httpOnly: true,
      secure: this.config.get<string>('COOKIE_SECURE') === 'true',
      sameSite: 'lax',
      path: '/api/auth',
      expires: expiresAt,
    });
  }

  private clearCookie(response: Response): void {
    response.clearCookie(REFRESH_COOKIE, {
      httpOnly: true,
      secure: this.config.get<string>('COOKIE_SECURE') === 'true',
      sameSite: 'lax',
      path: '/api/auth',
    });
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private toPublicUser(user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    locale: string;
    isPlatformAdmin: boolean;
  }): PublicUser {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      locale: user.locale,
      isPlatformAdmin: user.isPlatformAdmin,
    };
  }

  private toSummary(membership: MembershipWithTenant): MembershipSummary {
    return {
      id: membership.id,
      tenantId: membership.tenantId,
      role: membership.role as Role,
      branchId: membership.branchId,
      tenant: {
        id: membership.tenant.id,
        name: membership.tenant.name,
        slug: membership.tenant.slug,
        status: membership.tenant.status,
      },
    };
  }
}

export const REFRESH_COOKIE_NAME = REFRESH_COOKIE;
