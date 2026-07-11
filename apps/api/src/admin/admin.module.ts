import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminController, BrandSuggestionsController } from './admin.controller';

@Module({
  controllers: [AdminController, BrandSuggestionsController],
  providers: [AdminService],
})
export class AdminModule {}
