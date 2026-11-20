import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators';
import { TaxonomyService } from './taxonomy.service';

@ApiTags('Categories, locations & rating rules (public)')
@Public()
@Controller()
export class TaxonomyController {
  constructor(private taxonomy: TaxonomyService) {}

  @ApiOperation({
    summary:
      'Active categories with their rating dimensions and business counts',
  })
  @Get('categories')
  categories() {
    return this.taxonomy.categories();
  }

  @ApiOperation({
    summary: 'One category and the rating dimensions a review form must show',
  })
  @Get('categories/:slug')
  category(@Param('slug') slug: string) {
    return this.taxonomy.category(slug);
  }

  @ApiOperation({
    summary: 'Nigerian states (slugs used by filters) with business counts',
  })
  @Get('locations')
  locations() {
    return this.taxonomy.locations();
  }

  @ApiOperation({
    summary: 'How ratings are calculated (versioned, PRD §7.12)',
  })
  @Get('meta/rating-methodology')
  methodology() {
    return this.taxonomy.methodology();
  }
}
