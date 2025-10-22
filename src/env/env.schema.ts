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

  // Cloudflare R2 (S3-compatible) - Optional in case not configured yet
  S3_ENDPOINT: z.string().url().optional(),
  S3_REGION: z.string().default('auto'),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_BUCKET_NAME: z.string().optional(),
  S3_PUBLIC_URL: z.string().url().optional(),

  // CORS
  CORS_ORIGINS: z.string().default('http://localhost:3000,http://localhost:3001'),

  // Logging
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug', 'verbose']).default('info'),
  LOG_PRETTY: z.coerce.boolean().default(true),

  // Email Service (Resend)
  RESEND_API_KEY: z.string().min(1).describe('Resend API key for sending emails'),
  OWNER_EMAIL: z.string().email().describe('Owner email address'),
  EMAIL_FROM: z.string().default('Ecomate <no-reply@ecomatehome.com>'),
  FRONTEND_URL: z.string().url().default('http://localhost:3001').describe('Frontend URL for redirects'),
  BACKEND_URL: z.string().url().default('http://localhost:3000').describe('Backend API URL for email callback links'),
});

export type Env = z.infer<typeof envSchema>;