import {
  Controller,
  ExecutionContext,
  ForbiddenException,
  Get,
  Injectable,
  NotFoundException,
  Param,
  Query,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { CanActivate } from '@nestjs/common';
import { ApiBearerAuth, ApiParam, ApiTags } from '@nestjs/swagger';
import { PaginationQueryDto } from '../../common/dto/pagination.dto.js';
import { PERMISSIONS } from '../../common/permissions.js';
import type { Permission } from '../../common/permissions.js';
import type { RequestUser } from '../../common/types/request-user.js';
import { TRASH_ENTITIES, TrashService } from './trash.service.js';
import type { TrashEntity } from './trash.service.js';

/**
 * A single `:entity` route cannot carry a static `@RequirePermissions` — the
 * required permission depends on the path segment. This guard resolves the
 * mapping at request time; the global JwtAuthGuard has already populated
 * `request.user` by the time controller-scoped guards run.
 */
const TRASH_PERMISSIONS: Record<TrashEntity, Permission> = {
  students: PERMISSIONS.STUDENTS_READ,
  teachers: PERMISSIONS.TEACHERS_READ,
  documents: PERMISSIONS.DOCUMENTS_READ,
  lessonSeries: PERMISSIONS.SCHEDULE_READ,
  announcements: PERMISSIONS.ANNOUNCEMENTS_READ,
};

@Injectable()
export class TrashPermissionGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<{ params?: { entity?: string }; user?: RequestUser }>();

    const entity = request.params?.entity;
    if (!entity || !(entity in TRASH_PERMISSIONS)) {
      throw new NotFoundException({
        code: 'TRASH_ENTITY_NOT_FOUND',
        message: 'Άγνωστη οντότητα κάδου',
      });
    }

    const user = request.user;
    if (!user) {
      throw new UnauthorizedException('Απαιτείται σύνδεση');
    }

    const required = TRASH_PERMISSIONS[entity as TrashEntity];
    if (!user.permissions.includes(required)) {
      throw new ForbiddenException('Δεν έχετε δικαίωμα πρόσβασης σε αυτή την ενέργεια');
    }

    return true;
  }
}

@ApiTags('trash')
@ApiBearerAuth()
@Controller('trash')
@UseGuards(TrashPermissionGuard)
export class TrashController {
  constructor(private readonly trash: TrashService) {}

  @Get(':entity')
  @ApiParam({ name: 'entity', enum: TRASH_ENTITIES })
  list(@Param('entity') entity: string, @Query() query: PaginationQueryDto) {
    return this.trash.list(entity, query);
  }
}
