import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { PERMISSIONS } from '../../common/permissions.js';
import {
  AddGuardianDto,
  CreateStudentDto,
  CreateTeacherDto,
  EnrollmentInputDto,
  EnrollmentQueryDto,
  GuardianQueryDto,
  StudentQueryDto,
  StudentStatusDto,
  TeacherQueryDto,
  UpdateEnrollmentDto,
  UpdateStudentDto,
  UpdateTeacherDto,
} from './dto/people.dto.js';
import { PeopleService } from './people.service.js';

@ApiTags('students')
@ApiBearerAuth()
@Controller('students')
export class StudentsController {
  constructor(private readonly people: PeopleService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.STUDENTS_READ)
  list(@Query() query: StudentQueryDto) {
    return this.people.listStudents(query);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.STUDENTS_READ)
  get(@Param('id') id: string) {
    return this.people.getStudent(id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.STUDENTS_WRITE)
  create(@Body() dto: CreateStudentDto) {
    return this.people.createStudent(dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.STUDENTS_WRITE)
  update(@Param('id') id: string, @Body() dto: UpdateStudentDto) {
    return this.people.updateStudent(id, dto);
  }

  @Patch(':id/status')
  @RequirePermissions(PERMISSIONS.STUDENTS_WRITE)
  setStatus(@Param('id') id: string, @Body() dto: StudentStatusDto) {
    return this.people.setStudentStatus(id, dto);
  }

  @Post(':id/guardians')
  @RequirePermissions(PERMISSIONS.STUDENTS_WRITE)
  addGuardian(@Param('id') id: string, @Body() dto: AddGuardianDto) {
    return this.people.addGuardian(id, dto);
  }

  @Delete(':id/guardians/:relationId')
  @RequirePermissions(PERMISSIONS.STUDENTS_WRITE)
  removeGuardian(@Param('id') id: string, @Param('relationId') relationId: string) {
    return this.people.removeGuardian(id, relationId);
  }

  @Post(':id/enrollments')
  @RequirePermissions(PERMISSIONS.STUDENTS_WRITE)
  addEnrollment(@Param('id') id: string, @Body() dto: EnrollmentInputDto) {
    return this.people.addEnrollment(id, dto);
  }
}

@ApiTags('enrollments')
@ApiBearerAuth()
@Controller('enrollments')
export class EnrollmentsController {
  constructor(private readonly people: PeopleService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.STUDENTS_READ)
  list(@Query() query: EnrollmentQueryDto) {
    return this.people.listEnrollments(query);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.STUDENTS_WRITE)
  update(@Param('id') id: string, @Body() dto: UpdateEnrollmentDto) {
    return this.people.updateEnrollment(id, dto);
  }
}

@ApiTags('guardians')
@ApiBearerAuth()
@Controller('guardians')
export class GuardiansController {
  constructor(private readonly people: PeopleService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.STUDENTS_READ)
  list(@Query() query: GuardianQueryDto) {
    return this.people.listGuardians(query);
  }
}

@ApiTags('teachers')
@ApiBearerAuth()
@Controller('teachers')
export class TeachersController {
  constructor(private readonly people: PeopleService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.TEACHERS_READ)
  list(@Query() query: TeacherQueryDto) {
    return this.people.listTeachers(query);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.TEACHERS_READ)
  get(@Param('id') id: string) {
    return this.people.getTeacher(id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.TEACHERS_WRITE)
  create(@Body() dto: CreateTeacherDto) {
    return this.people.createTeacher(dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.TEACHERS_WRITE)
  update(@Param('id') id: string, @Body() dto: UpdateTeacherDto) {
    return this.people.updateTeacher(id, dto);
  }
}
