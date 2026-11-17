import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { SWAGGER_BEARER_AUTH } from './common/swagger';
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
        '1. **Auth** → `POST /auth/login` → copy `data.accessToken`',
        '2. Click **Authorize** → paste token (no `Bearer ` prefix)',
        '3. Open tag **Users — Me (JWT)** for `/users/me`, `/users/me/dashboard`, `/users/me/reviews`',
        '4. Public browse: **Home**, **Brands** (no token needed)',
        '',
        'Docs: `docs/FRONTEND-INTEGRATION.md`, `docs/SWAGGER-GUIDE.md`, `docs/API-TESTING-GUIDE.md`',
      ].join('\n'),
    )
    .setVersion('1.1')
    .addServer(
      `http://localhost:${process.env.PORT ?? 3001}`,
      'Local development',
    )
    .addTag('Users — Me (JWT)', 'Profile, dashboard, my reviews — login + Authorize required')
    .addTag('Users — Public', 'Public profile by username')
    .addTag('Auth', 'Register, login, OTP')
    .addTag('Home', 'Landing page feed')
    .addTag('Brands', 'Explore and brand detail')
    .addTag('Reviews', 'Create/list reviews, helpful votes')
    .addTag('Admin (JWT + ADMIN role)', 'Moderation — use admin@revyu.ng')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description:
          'JWT from POST /auth/login or /auth/register. Click Authorize and paste the accessToken value only (no "Bearer " prefix).',
      },
      SWAGGER_BEARER_AUTH,
    )
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document, {
    jsonDocumentUrl: 'docs/openapi.json',
    swaggerOptions: {
      persistAuthorization: true,
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
