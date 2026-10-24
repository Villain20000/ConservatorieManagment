import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { PERMISSIONS } from '../../common/permissions.js';
import {
  CreateAcademicYearDto,
  CreateLevelDto,
  CreateProgramDto,
  CreateRoomDto,
  UpdateAcademicYearDto,
  UpdateLevelDto,
  UpdateProgramDto,
  UpdateRoomDto,
} from './dto/academics.dto.js';
import { AcademicsService } from './academics.service.js';

@ApiTags('academics')
@ApiBearerAuth()
@Controller('academics')
export class AcademicsController {
  constructor(private readonly academics: AcademicsService) {}

  @Get('options')
  @RequirePermissions(PERMISSIONS.ACADEMICS_READ)
  options() {
    return this.academics.options();
  }

  @Get('academic-years')
  @RequirePermissions(PERMISSIONS.ACADEMICS_READ)
  listYears() {
    return this.academics.listYears();
  }

  @Post('academic-years')
  @RequirePermissions(PERMISSIONS.ACADEMICS_WRITE)
  createYear(@Body() dto: CreateAcademicYearDto) {
    return this.academics.createYear(dto);
  }

  @Patch('academic-years/:id')
  @RequirePermissions(PERMISSIONS.ACADEMICS_WRITE)
  updateYear(@Param('id') id: string, @Body() dto: UpdateAcademicYearDto) {
    return this.academics.updateYear(id, dto);
  }

  @Delete('academic-years/:id')
  @RequirePermissions(PERMISSIONS.ACADEMICS_WRITE)
  removeYear(@Param('id') id: string) {
    return this.academics.removeYear(id);
  }

  @Get('programs')
  @RequirePermissions(PERMISSIONS.ACADEMICS_READ)
  listPrograms() {
    return this.academics.listPrograms();
  }

  @Post('programs')
  @RequirePermissions(PERMISSIONS.ACADEMICS_WRITE)
  createProgram(@Body() dto: CreateProgramDto) {
    return this.academics.createProgram(dto);
  }

  @Patch('programs/:id')
  @RequirePermissions(PERMISSIONS.ACADEMICS_WRITE)
  updateProgram(@Param('id') id: string, @Body() dto: UpdateProgramDto) {
    return this.academics.updateProgram(id, dto);
  }

  @Delete('programs/:id')
  @RequirePermissions(PERMISSIONS.ACADEMICS_WRITE)
  removeProgram(@Param('id') id: string) {
    return this.academics.removeProgram(id);
  }

  @Get('levels')
  @RequirePermissions(PERMISSIONS.ACADEMICS_READ)
  listLevels() {
    return this.academics.listLevels();
  }

  @Post('levels')
  @RequirePermissions(PERMISSIONS.ACADEMICS_WRITE)
  createLevel(@Body() dto: CreateLevelDto) {
    return this.academics.createLevel(dto);
  }

  @Patch('levels/:id')
  @RequirePermissions(PERMISSIONS.ACADEMICS_WRITE)
  updateLevel(@Param('id') id: string, @Body() dto: UpdateLevelDto) {
    return this.academics.updateLevel(id, dto);
  }

  @Delete('levels/:id')
  @RequirePermissions(PERMISSIONS.ACADEMICS_WRITE)
  removeLevel(@Param('id') id: string) {
    return this.academics.removeLevel(id);
  }

  @Get('rooms')
  @RequirePermissions(PERMISSIONS.ACADEMICS_READ)
  listRooms() {
    return this.academics.listRooms();
  }

  @Post('rooms')
  @RequirePermissions(PERMISSIONS.ACADEMICS_WRITE)
  createRoom(@Body() dto: CreateRoomDto) {
    return this.academics.createRoom(dto);
  }

  @Patch('rooms/:id')
  @RequirePermissions(PERMISSIONS.ACADEMICS_WRITE)
  updateRoom(@Param('id') id: string, @Body() dto: UpdateRoomDto) {
    return this.academics.updateRoom(id, dto);
  }

  @Delete('rooms/:id')
  @RequirePermissions(PERMISSIONS.ACADEMICS_WRITE)
  removeRoom(@Param('id') id: string) {
    return this.academics.removeRoom(id);
  }
}
