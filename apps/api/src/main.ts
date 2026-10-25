import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { JsonLogger } from './common/logging/json.logger.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: false, bufferLogs: true });
  const config = app.get(ConfigService);

  if (config.get<string>('LOG_FORMAT') === 'json') {
    app.useLogger(app.get(JsonLogger));
  } else {
    app.flushLogs();
  }

  app.setGlobalPrefix('api');
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cookieParser());
  app.enableCors({
    origin: (config.get<string>('WEB_ORIGIN') ?? 'http://localhost:4200').split(','),
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.enableShutdownHooks();

  if (config.get<string>('NODE_ENV') !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('MusicOS API')
      .setDescription('Multi-tenant conservatory management API')
      .setVersion('0.1')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = Number(config.get<string>('PORT') ?? 3000);
  await app.listen(port);
  console.log(`MusicOS API listening on http://localhost:${port}/api`);
}

await bootstrap();
