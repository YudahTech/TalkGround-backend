import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { SWAGGER_COOKIE_AUTH } from './common/swagger';
import { ACCESS_COOKIE } from './auth/cookies';
import { checkSecurityConfig } from './common/bootstrap-security';
import { configureApp } from './app.setup';

async function bootstrap() {
  checkSecurityConfig();
  const app = await NestFactory.create(AppModule);
  configureApp(app);

  const swaggerConfig = new DocumentBuilder()
    .setTitle('TalkGround API')
    .setDescription(
      [
        'TalkGround REST API — business reputation and customer experience platform (Nigeria).',
        '',
        '## How to use Swagger',
        '**Auth is HttpOnly-cookie only.** There is no Bearer token and nothing to paste.',
        '',
        '1. `POST /auth/login` → Execute. The browser stores the `talkground_at` / `talkground_rt` cookies.',
        '2. Every later "Try it out" call from this page sends the cookie automatically.',
        '3. `POST /auth/logout` clears the cookies.',
        '',
        'Public (no login): businesses, categories, locations, rating methodology, reviews, public profiles.',
        'Staff routes need a staff role holding the permission named on each route.',
        '',
        'Frontend guides: `docs/FRONTEND-AUTH.md`, `docs/FRONTEND-INTEGRATION.md`',
      ].join('\n'),
    )
    .setVersion('2.0')
    .addServer(
      `http://localhost:${process.env.PORT ?? 3001}`,
      'Local development',
    )
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
void bootstrap();
