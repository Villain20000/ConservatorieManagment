import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { PERMISSIONS } from '../../common/permissions.js';
import {
  AssignmentQueryDto,
  CreateAssignmentDto,
  GradeSubmissionDto,
  SubmitAssignmentDto,
  UpdateAssignmentDto,
} from './dto/assignments.dto.js';
import { AssignmentsService } from './assignments.service.js';

@ApiTags('assignments')
@ApiBearerAuth()
@Controller('assignments')
export class AssignmentsController {
  constructor(private readonly assignments: AssignmentsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.SCHEDULE_READ)
  list(@Query() query: AssignmentQueryDto) {
    return this.assignments.list(query);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.SCHEDULE_READ)
  create(@Body() dto: CreateAssignmentDto) {
    return this.assignments.create(dto);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.SCHEDULE_READ)
  get(@Param('id') id: string) {
    return this.assignments.get(id);
  }

  @Put(':id')
  @RequirePermissions(PERMISSIONS.SCHEDULE_READ)
  update(@Param('id') id: string, @Body() dto: UpdateAssignmentDto) {
    return this.assignments.update(id, dto);
  }

  @Get(':id/submissions')
  @RequirePermissions(PERMISSIONS.SCHEDULE_READ)
  submissions(@Param('id') id: string) {
    return this.assignments.listSubmissions(id);
  }

  @Post(':id/submissions/:submissionId/grade')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.SCHEDULE_READ)
  grade(
    @Param('id') id: string,
    @Param('submissionId') submissionId: string,
    @Body() dto: GradeSubmissionDto,
  ) {
    return this.assignments.grade(id, submissionId, dto);
  }
}

/** Student-facing submission endpoints. Students hold SCHEDULE_READ but no
 * write permission, so submission lives on its own controller with the
 * resource-level ownership checks done in the service. */
@ApiTags('assignments')
@ApiBearerAuth()
@Controller('assignments')
export class StudentAssignmentsController {
  constructor(private readonly assignments: AssignmentsService) {}

  @Post(':id/submit')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.SCHEDULE_READ)
  submit(@Param('id') id: string, @Body() dto: SubmitAssignmentDto) {
    return this.assignments.submit(id, dto);
  }
}
