import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BrandsService } from './brands.service';
import { BrandQueryDto } from './brands.dto';
import { Public } from '../common/decorators';
import { CurrentUser } from '../common/current-user.decorator';
import { SWAGGER_BEARER_AUTH } from '../common/swagger';

@ApiTags('Brands')
@Controller('brands')
export class BrandsController {
  constructor(private brands: BrandsService) {}

  @Public()
  @ApiOperation({ summary: 'Explore sidebar filters with live counts (public)' })
  @Get('filters')
  async getFilters() {
    return { data: await this.brands.getFilterOptions() };
  }

  @Public()
  @ApiOperation({ summary: 'List/search brands (public)' })
  @Get()
  findAll(@Query() query: BrandQueryDto) {
    return this.brands.findAll(query);
  }

  @ApiBearerAuth(SWAGGER_BEARER_AUTH)
  @ApiOperation({ summary: 'Has current user reviewed this brand? (JWT required)' })
  @Get(':slug/context')
  getContext(
    @Param('slug') slug: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.brands.getUserBrandContext(slug, user.id);
  }

  @Public()
  @ApiOperation({ summary: 'Brand detail page (public)' })
  @Get(':slug')
  findOne(@Param('slug') slug: string) {
    return this.brands.findBySlug(slug);
  }
}
