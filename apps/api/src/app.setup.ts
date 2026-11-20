import { INestApplication, ValidationPipe } from '@nestjs/common';
import { applySecurity } from './common/bootstrap-security';

/**
 * Everything that makes the HTTP app behave like production: security middleware, the
 * /api/v1 prefix and strict validation. Shared by main.ts and the e2e tests so tests
 * exercise exactly what is deployed.
 */
export function configureApp(app: INestApplication) {
  applySecurity(app);
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  return app;
}
