import { Global, Module } from '@nestjs/common';
import { BusinessesController } from './businesses.controller';
import { BusinessesService } from './businesses.service';
import { BusinessWriterService } from './business-writer.service';
import { RatingsService } from './ratings.service';
import { BusinessAccessService } from './business-access.service';
import { SeoService } from './seo.service';

/** Global: ratings, writes, SEO and access checks are used by reviews, claims, portal and admin. */
@Global()
@Module({
  controllers: [BusinessesController],
  providers: [
    BusinessesService,
    BusinessWriterService,
    RatingsService,
    BusinessAccessService,
    SeoService,
  ],
  exports: [
    BusinessesService,
    BusinessWriterService,
    RatingsService,
    BusinessAccessService,
    SeoService,
  ],
})
export class BusinessesModule {}
