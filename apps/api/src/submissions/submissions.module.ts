import { Module } from '@nestjs/common';
import {
  SubmissionsAdminController,
  SubmissionsController,
} from './submissions.controller';
import { SubmissionsService } from './submissions.service';

@Module({
  controllers: [SubmissionsController, SubmissionsAdminController],
  providers: [SubmissionsService],
})
export class SubmissionsModule {}
