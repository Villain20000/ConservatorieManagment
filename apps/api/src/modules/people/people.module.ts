import { Module } from '@nestjs/common';
import {
  EnrollmentsController,
  GuardiansController,
  StudentsController,
  TeachersController,
} from './people.controller.js';
import { PeopleService } from './people.service.js';

@Module({
  controllers: [StudentsController, EnrollmentsController, GuardiansController, TeachersController],
  providers: [PeopleService],
  exports: [PeopleService],
})
export class PeopleModule {}
