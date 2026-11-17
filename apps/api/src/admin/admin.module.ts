import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminController, BrandSuggestionsController } from './admin.controller';
import { AuthModule } from '../auth/auth.module';
import { UploadsModule } from '../uploads/uploads.module';

@Module({
  imports: [AuthModule, UploadsModule],
  controllers: [AdminController, BrandSuggestionsController],
  providers: [AdminService],
})
export class AdminModule {}
