import { Global, Module } from '@nestjs/common';
import { BusinessesController } from './businesses.controller';
import { BusinessesService } from './businesses.service';
import { BusinessWriterService } from './business-writer.service';
import { RatingsService } from './ratings.service';
import { BusinessAccessService } from './business-access.service';

/** Global: ratings, writes and access checks are used by reviews, claims, portal and admin. */
@Global()
@Module({
  controllers: [BusinessesController],
  providers: [
    BusinessesService,
    BusinessWriterService,
    RatingsService,
    BusinessAccessService,
  ],
  exports: [
    BusinessesService,
    BusinessWriterService,
    RatingsService,
    BusinessAccessService,
  ],
})
export class BusinessesModule {}
