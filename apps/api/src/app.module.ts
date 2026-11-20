import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { ReviewsModule } from './reviews/reviews.module';
import { GrowthModule } from './growth/growth.module';
import { UsersModule } from './users/users.module';
import { AdminModule } from './admin/admin.module';
import { UploadsModule } from './uploads/uploads.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { PermissionsGuard } from './common/permissions';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { EmailModule } from './email/email.module';
import { AuditModule } from './audit/audit.module';
import { BusinessesModule } from './businesses/businesses.module';
import { TaxonomyModule } from './taxonomy/taxonomy.module';
import { SubmissionsModule } from './submissions/submissions.module';
import { ClaimsModule } from './claims/claims.module';
import { PortalModule } from './portal/portal.module';
import { ModerationModule } from './moderation/moderation.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AppConfigModule } from './common/app-config';
import { RevalidationModule } from './revalidation/revalidation.service';
import { CacheControlInterceptor } from './common/cache.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Global default: 120 requests/minute per IP. Auth routes set stricter limits with @Throttle.
    // In-memory store: correct for a single instance; move to Redis before scaling horizontally.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 120 }]),
    AppConfigModule,
    PrismaModule,
    RevalidationModule,
    EmailModule,
    AuditModule,
    NotificationsModule,
    ModerationModule,
    BusinessesModule,
    TaxonomyModule,
    SubmissionsModule,
    ClaimsModule,
    PortalModule,
    AuthModule,
    ReviewsModule,
    GrowthModule,
    UsersModule,
    AdminModule,
    UploadsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: CacheControlInterceptor },
  ],
})
export class AppModule {}
