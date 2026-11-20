import { Module } from '@nestjs/common';
import { ClaimsAdminController, ClaimsController } from './claims.controller';
import { ClaimsService } from './claims.service';
import { UploadsModule } from '../uploads/uploads.module';

@Module({
  imports: [UploadsModule],
  controllers: [ClaimsController, ClaimsAdminController],
  providers: [ClaimsService],
})
export class ClaimsModule {}
