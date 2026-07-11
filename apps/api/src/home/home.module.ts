import { Module } from '@nestjs/common';
import { BrandsModule } from '../brands/brands.module';
import { HomeController } from './home.controller';
import { HomeService } from './home.service';

@Module({
  imports: [BrandsModule],
  controllers: [HomeController],
  providers: [HomeService],
})
export class HomeModule {}
