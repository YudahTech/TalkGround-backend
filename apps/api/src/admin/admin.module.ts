import { Module } from '@nestjs/common';
import {
  AdminBusinessesController,
  AdminModerationController,
  AdminTaxonomyController,
  AdminUsersController,
} from './admin.controller';
import { AdminService } from './admin.service';
import { ModerationAdminService } from './moderation-admin.service';
import { AuthModule } from '../auth/auth.module';
import { UploadsModule } from '../uploads/uploads.module';

@Module({
  imports: [AuthModule, UploadsModule],
  controllers: [
    AdminUsersController,
    AdminBusinessesController,
    AdminModerationController,
    AdminTaxonomyController,
  ],
  providers: [AdminService, ModerationAdminService],
})
export class AdminModule {}
