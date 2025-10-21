import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { envSchema, type Env } from './env.schema';

@Injectable()
export class EnvService {
  private readonly config: Env;

  constructor(private configService: ConfigService) {
    // Validate environment variables on startup
    const result = envSchema.safeParse(process.env);

    if (!result.success) {
      const errors = result.error.format();
      console.error('❌ Invalid environment variables:', errors);
      throw new Error('Invalid environment configuration');
    }

    this.config = result.data;
  }

  get<K extends keyof Env>(key: K): Env[K] {
    return this.config[key];
  }

  getOrThrow<K extends keyof Env>(key: K): Env[K] {
    const value = this.config[key];
    if (value === undefined || value === null) {
      throw new Error(`Missing required environment variable: ${String(key)}`);
    }
    return value;
  }

  isDevelopment(): boolean {
    return this.config.NODE_ENV === 'development';
  }

  isProduction(): boolean {
    return this.config.NODE_ENV === 'production';
  }

  isTest(): boolean {
    return this.config.NODE_ENV === 'test';
  }

  getDatabaseUrl(): string {
    return this.config.DATABASE_URL;
  }

  getRedisConfig() {
    return {
      url: this.config.REDIS_URL,
      token: this.config.REDIS_TOKEN,
    };
  }

  getJwtConfig() {
    return {
      secret: this.config.JWT_SECRET,
      expiresIn: this.config.JWT_EXPIRES_IN,
      refreshSecret: this.config.JWT_REFRESH_SECRET,
      refreshExpiresIn: this.config.JWT_REFRESH_EXPIRES_IN,
    };
  }

  getS3Config() {
    return {
      endpoint: this.config.S3_ENDPOINT,
      region: this.config.S3_REGION,
      credentials: {
        accessKeyId: this.config.S3_ACCESS_KEY_ID,
        secretAccessKey: this.config.S3_SECRET_ACCESS_KEY,
      },
      bucket: this.config.S3_BUCKET_NAME,
      publicUrl: this.config.S3_PUBLIC_URL,
    };
  }

  getRateLimitConfig() {
    return {
      ttl: this.config.RATE_LIMIT_TTL,
      max: this.config.RATE_LIMIT_MAX,
    };
  }

  getCorsOrigins(): string[] {
    return this.config.CORS_ORIGINS.split(',').map((origin) => origin.trim());
  }
}