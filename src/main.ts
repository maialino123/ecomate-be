import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      logger: true,
      trustProxy: true,
    }),
  );

  // Security
  await app.register(helmet as any, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
  });

  // CORS
  await app.register(cors as any, {
    origin: process.env.CORS_ORIGINS?.split(',') || true,
    credentials: true,
  });

  // Global pipes
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // API Versioning
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  // Swagger documentation
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Ecomate API')
      .setDescription('The Ecomate backend API documentation')
      .setVersion('1.0')
      .addBearerAuth()
      .addTag('auth', 'Authentication endpoints')
      .addTag('products', 'Product management')
      .addTag('suppliers', 'Supplier management')
      .addTag('costs', 'Cost calculation')
      .addTag('settings', 'Application settings')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  // Add simple ping endpoint for Railway healthcheck
  const fastifyInstance = app.getHttpAdapter().getInstance();
  fastifyInstance.get('/ping', async (request, reply) => {
    return { status: 'ok', timestamp: Date.now() };
  });

  // Graceful shutdown
  app.enableShutdownHooks();

  // Railway provides PORT env variable
  const port = parseInt(process.env.PORT || '3000', 10);
  const host = process.env.HOST || '0.0.0.0';

  await app.listen(port, host);

  console.log('='.repeat(50));
  console.log(`🚀 Application is running`);
  console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🌐 URL: http://${host}:${port}`);
  console.log(`🏓 Ping (Railway): http://${host}:${port}/ping`);
  console.log(`❤️  Health: http://${host}:${port}/health`);
  console.log(`✅ Live: http://${host}:${port}/health/live`);
  if (process.env.NODE_ENV !== 'production') {
    console.log(`📚 API Docs: http://${host}:${port}/api/docs`);
  }
  console.log('='.repeat(50));
}

bootstrap().catch((error) => {
  console.error('❌ Failed to start application:', error);
  process.exit(1);
});