import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators';
import { ApiData, ApiErrors } from '../common/api-response';
import { TaxonomyService } from './taxonomy.service';
import {
  CategoryOutDto,
  CityOutDto,
  MethodologyDto,
  PublicConfigDto,
} from './taxonomy.responses';

@ApiTags('Categories, cities & rules (public)')
@Public()
@Controller()
export class TaxonomyController {
  constructor(private taxonomy: TaxonomyService) {}

  @ApiOperation({
    summary:
      'Active categories with their rating dimensions and business counts',
  })
  @ApiData(CategoryOutDto, { isArray: true })
  @Get('categories')
  categories() {
    return this.taxonomy.categories();
  }

  @ApiOperation({
    summary: 'One category and the rating dimensions the review form must show',
  })
  @ApiData(CategoryOutDto)
  @ApiErrors(404)
  @Get('categories/:slug')
  category(@Param('slug') slug: string) {
    return this.taxonomy.category(slug);
  }

  @ApiOperation({
    summary:
      'Active cities (slugs used by filters and forms) with business counts',
  })
  @ApiData(CityOutDto, { isArray: true })
  @Get('cities')
  cities() {
    return this.taxonomy.cities();
  }

  @ApiOperation({
    summary: 'How ratings are calculated (versioned, PRD §7.12)',
  })
  @ApiData(MethodologyDto)
  @Get('meta/rating-methodology')
  methodology() {
    return this.taxonomy.methodology();
  }

  @ApiOperation({
    summary:
      'Configured limits the frontend should mirror (minimum reviews, lengths, cache time…)',
  })
  @ApiData(PublicConfigDto)
  @Get('meta/config')
  config() {
    return this.taxonomy.publicConfig();
  }
}
