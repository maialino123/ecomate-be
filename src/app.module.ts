import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
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

    // Core modules
    AuthModule,
    AdminModule,
    ProductModule,
    SupplierModule,
    CostModule,
    SettingsModule,
    Ingest1688Module,
    TranslationModule,

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