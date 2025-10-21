import { z } from 'zod';

export const envSchema = z.object({
  // App
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default('0.0.0.0'),

  // Database (Railway PostgreSQL)
  DATABASE_URL: z.string().url().describe('PostgreSQL connection string'),

  // Redis (Railway Redis hoặc Upstash)
  REDIS_URL: z.string().url().describe('Redis URL'),
  REDIS_TOKEN: z.string().optional(),

  // JWT (for authentication - remove if not needed)
  JWT_SECRET: z.string().min(32).default('your-secret-key-at-least-32-chars-long-here'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  JWT_REFRESH_SECRET: z.string().min(32).default('your-refresh-secret-at-least-32-chars-long'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),

  // Cloudflare R2 (S3-compatible)
  S3_ENDPOINT: z.string().url(),
  S3_REGION: z.string().default('auto'),
  S3_ACCESS_KEY_ID: z.string(),
  S3_SECRET_ACCESS_KEY: z.string(),
  S3_BUCKET_NAME: z.string(),
  S3_PUBLIC_URL: z.string().url(),

  // CORS
  CORS_ORIGINS: z.string().default('http://localhost:3000,http://localhost:3001'),

  // Logging
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug', 'verbose']).default('info'),
  LOG_PRETTY: z.coerce.boolean().default(true),
});

export type Env = z.infer<typeof envSchema>;