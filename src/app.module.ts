import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { EnvModule } from './env/env.module';
import { DatabaseModule } from './db/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { AdminModule } from './modules/admin/admin.module';
import { ProductModule } from './modules/product/product.module';
import { SupplierModule } from './modules/supplier/supplier.module';
import { CostModule } from './modules/cost/cost.module';
import { SettingsModule } from './modules/settings/settings.module';
import { Ingest1688Module } from './modules/ingest1688/ingest1688.module';
import { TranslationModule } from './modules/translation/translation.module';
import { Product1688Module } from './modules/product1688/product1688.module';
import { TelegramBotModule } from './modules/telegram-bot/telegram-bot.module';
import { LoggerModule } from './utils/logger/logger.module';
import { RedisModule } from './utils/redis/redis.module';
import { S3Module } from './utils/s3/s3.module';
import { EmailModule } from './utils/email/email.module';
import { JobsModule } from './jobs/jobs.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      expandVariables: true,
    }),
    EnvModule,

    // Database
    DatabaseModule,

    // BullMQ (Job Queue)
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get('REDIS_HOST') || 'localhost',
          port: configService.get('REDIS_PORT') || 6379,
          password: configService.get('REDIS_PASSWORD'),
        },
      }),
      inject: [ConfigService],
    }),

    // Core modules
    AuthModule,
    AdminModule,
    ProductModule,
    SupplierModule,
    CostModule,
    SettingsModule,
    Ingest1688Module,
    TranslationModule,
    Product1688Module,
    TelegramBotModule,

    // Utilities
    LoggerModule,
    RedisModule,
    S3Module,
    EmailModule,

    // Jobs & Tasks
    JobsModule,

    // Health checks
    HealthModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}