import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { OptionalAuth, Public } from '../common/decorators';
import { CurrentUser } from '../common/current-user.decorator';
import type { AuthUser } from '../common/current-user.decorator';
import { ApiDataOneOf, ApiErrors, ApiPaged } from '../common/api-response';
import { ReviewDto } from '../reviews/reviews.responses';
import { BusinessesService } from './businesses.service';
import { SeoService } from './seo.service';
import {
  CategoryPageQueryDto,
  ReviewListQueryDto,
  SearchBusinessesQueryDto,
} from './businesses.dto';
import {
  BusinessCardDto,
  BusinessNoticeDto,
  BusinessProfileDto,
  BusinessRedirectDto,
  CategoryPageDto,
} from './businesses.responses';
import { ApiExtraModels, ApiOkResponse, getSchemaPath } from '@nestjs/swagger';
import { PageMetaDto } from '../common/api-response';
import { ApiProperty } from '@nestjs/swagger';

class SitemapEntryDto {
  @ApiProperty({ enum: ['business', 'category', 'category_city'] })
  type: string;
  @ApiProperty({ example: '/b/mama-put-kitchen' }) path: string;
  @ApiProperty({ example: 'https://talkground.ng/b/mama-put-kitchen' })
  url: string;
  @ApiProperty() lastModified: Date;
}

@ApiTags('Businesses (public)')
@Controller()
export class BusinessesController {
  constructor(
    private businesses: BusinessesService,
    private seo: SeoService,
  ) {}

  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Search published businesses',
    description:
      'Matches name, alternative names, social handles (@handle or handle), website domain, category, city and area (partial words work), ' +
      'and phone numbers exactly. Filters: category, city, minRating (only businesses with a displayed rating). Sort: relevance | most_reviewed | rating.',
  })
  @ApiPaged(BusinessCardDto)
  @ApiErrors(400)
  @Get('businesses')
  search(@Query() query: SearchBusinessesQueryDto) {
    return this.businesses.search(query);
  }

  @Public()
  @ApiOperation({
    summary: 'Public business profile (server-render ready)',
    description:
      'data.kind = "profile" (render it; use data.seo for robots, canonical, title, description, Open Graph and JSON-LD), ' +
      '"redirect" (send a 301 to data.location — old slug or merged listing) or "suspended" (notice page, noindex). ' +
      '410 when archived; 404 when not public.',
  })
  @ApiDataOneOf([BusinessProfileDto, BusinessRedirectDto, BusinessNoticeDto])
  @ApiErrors(404, 410)
  @Get('businesses/:slug')
  profile(@Param('slug') slug: string) {
    return this.businesses.profile(slug);
  }

  @OptionalAuth()
  @ApiOperation({
    summary:
      'Visible reviews of a business (helpfulByMe is set only for signed-in callers)',
  })
  @ApiPaged(ReviewDto)
  @ApiErrors(400, 404)
  @Get('businesses/:slug/reviews')
  reviews(
    @Param('slug') slug: string,
    @Query() query: ReviewListQueryDto,
    @CurrentUser() user?: AuthUser | null,
  ) {
    return this.businesses.reviews(slug, query, user?.id);
  }

  @Public()
  @ApiOperation({
    summary:
      'Category page /c/{category} and category-in-city page /c/{category}/{city}',
    description:
      'Published businesses plus seo (indexable only with at least INDEXABLE_MIN_LISTINGS businesses).',
  })
  @ApiExtraModels(CategoryPageDto, PageMetaDto)
  @ApiOkResponse({
    schema: {
      properties: {
        data: { $ref: getSchemaPath(CategoryPageDto) },
        meta: { $ref: getSchemaPath(PageMetaDto) },
      },
    },
  })
  @ApiErrors(404)
  @Get('categories/:slug/businesses')
  categoryPage(@Param('slug') slug: string, @Query() q: CategoryPageQueryDto) {
    return this.businesses.categoryPage(slug, q.city, q.page, q.limit);
  }

  @Public()
  @ApiOperation({
    summary:
      'Sitemap source: only indexable business, category and category-in-city URLs (PRD §7.13)',
    description: 'The frontend renders this as /sitemap.xml.',
  })
  @ApiExtraModels(SitemapEntryDto)
  @ApiOkResponse({
    schema: {
      properties: {
        data: {
          type: 'array',
          items: { $ref: getSchemaPath(SitemapEntryDto) },
        },
      },
    },
  })
  @Get('seo/sitemap')
  async sitemap() {
    return { data: await this.seo.sitemap() };
  }
}
