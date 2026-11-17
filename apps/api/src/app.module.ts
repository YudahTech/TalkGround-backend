import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { BrandsModule } from './brands/brands.module';
import { ReviewsModule } from './reviews/reviews.module';
import { GrowthModule } from './growth/growth.module';
import { UsersModule } from './users/users.module';
import { AdminModule } from './admin/admin.module';
import { UploadsModule } from './uploads/uploads.module';
import { HomeModule } from './home/home.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { RolesGuard } from './auth/roles.guard';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { EmailModule } from './email/email.module';
import { AuditModule } from './audit/audit.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Global default: 120 requests/minute per IP. Auth routes set stricter limits with @Throttle.
    // In-memory store: correct for a single instance; move to Redis before scaling horizontally.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 120 }]),
    PrismaModule,
    EmailModule,
    AuditModule,
    AuthModule,
    BrandsModule,
    ReviewsModule,
    GrowthModule,
    UsersModule,
    AdminModule,
    UploadsModule,
    HomeModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
  ],
})
export class AppModule {}
