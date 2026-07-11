import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators';
import { HomeService } from './home.service';
import { HomeQueryDto } from './home.dto';

@ApiTags('Home')
@Controller()
export class HomeController {
  constructor(private home: HomeService) {}

  @Public()
  @ApiOperation({ summary: 'Landing page feed — trusted cards, sector brands, top rated (public)' })
  @Get('home')
  getHome(@Query() query: HomeQueryDto) {
    return this.home.getHomeFeed(query);
  }
}
