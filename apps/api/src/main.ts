import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { SWAGGER_COOKIE_AUTH } from './common/swagger';
import { ACCESS_COOKIE } from './auth/cookies';
import { applySecurity, checkSecurityConfig } from './common/bootstrap-security';

async function bootstrap() {
  checkSecurityConfig();
  const app = await NestFactory.create(AppModule);
  applySecurity(app);

  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('TalkGround API')
    .setDescription(
      [
        'TalkGround REST API — restaurants & hotels in Lagos & Abuja.',
        '',
        '## How to use Swagger',
        '**Auth is HttpOnly-cookie only.** There is no Bearer token and nothing to paste.',
        '',
        '1. **Auth** → `POST /auth/login` → Execute. The browser stores the `talkground_at` / `talkground_rt` cookies.',
        '2. Every later "Try it out" call from this page sends the cookie automatically.',
        '3. Open tag **Users — Me (JWT)** for `/users/me`, `/users/me/dashboard`, `/users/me/reviews`',
        '4. `POST /auth/logout` clears the cookies.',
        '5. Public browse: **Home**, **Brands** (no login needed)',
        '',
        'Docs: `docs/FRONTEND-INTEGRATION.md`, `docs/SWAGGER-GUIDE.md`, `docs/API-TESTING-GUIDE.md`',
      ].join('\n'),
    )
    .setVersion('1.2')
    .addServer(
      `http://localhost:${process.env.PORT ?? 3001}`,
      'Local development',
    )
    .addTag(
      'Users — Me (JWT)',
      'Profile, dashboard, my reviews — log in first (cookie session)',
    )
    .addTag('Users — Public', 'Public profile by username')
    .addTag('Auth', 'Register, login, OTP')
    .addTag('Home', 'Landing page feed')
    .addTag('Brands', 'Explore and brand detail')
    .addTag('Reviews', 'Create/list reviews, helpful votes')
    .addTag('Admin (JWT + ADMIN role)', 'Moderation — use admin@revyu.ng')
    .addCookieAuth(
      ACCESS_COOKIE,
      {
        type: 'apiKey',
        in: 'cookie',
        name: ACCESS_COOKIE,
        description:
          'HttpOnly session cookie set by POST /auth/login or /auth/register. No need to use Authorize — just log in on this page.',
      },
      SWAGGER_COOKIE_AUTH,
    )
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document, {
    jsonDocumentUrl: 'docs/openapi.json',
    swaggerOptions: {
      persistAuthorization: true,
      withCredentials: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
  });

  const port = process.env.PORT ?? 3001;
  await app.listen(port);
  console.log(`TalkGround API running on http://localhost:${port}/api/v1`);
  console.log(`Swagger UI: http://localhost:${port}/docs`);
  console.log(`OpenAPI JSON: http://localhost:${port}/docs/openapi.json`);
}
bootstrap();
