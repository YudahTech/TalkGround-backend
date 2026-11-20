import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { OptionalAuth, Public } from '../common/decorators';
import { CurrentUser } from '../common/current-user.decorator';
import type { AuthUser } from '../common/current-user.decorator';
import { BusinessesService } from './businesses.service';
import { ReviewListQueryDto, SearchBusinessesQueryDto } from './businesses.dto';

@ApiTags('Businesses (public)')
@Controller('businesses')
export class BusinessesController {
  constructor(private businesses: BusinessesService) {}

  @Public()
  @ApiOperation({
    summary: 'Search published businesses',
    description:
      'Matches name, alternative names, social handles, website, phone, CAC number, category and location. ' +
      'Partial words work ("kem clo"). Filters: category, state, city, minRating (only businesses with enough reviews). ' +
      'Sort: relevance | most_reviewed | rating.',
  })
  @Get()
  search(@Query() query: SearchBusinessesQueryDto) {
    return this.businesses.search(query);
  }

  @Public()
  @ApiOperation({
    summary: 'Public business profile',
    description:
      'Rating block (average is null until enough reviews), distribution, dimension breakdown, ownership badge, ' +
      'locations, public links and recent reviews. A merged listing returns { merged: true, mergedInto: { slug } }.',
  })
  @Get(':slug')
  profile(@Param('slug') slug: string) {
    return this.businesses.profile(slug);
  }

  @OptionalAuth()
  @ApiOperation({
    summary:
      'Published reviews of a business (signed-in callers also get myVote)',
  })
  @Get(':slug/reviews')
  reviews(
    @Param('slug') slug: string,
    @Query() query: ReviewListQueryDto,
    @CurrentUser() user?: AuthUser | null,
  ) {
    return this.businesses.reviews(slug, query, user?.id);
  }
}
