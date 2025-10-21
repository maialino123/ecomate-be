import { Controller, Get, Version, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import {
  HealthCheckService,
  HealthCheck,
  MemoryHealthIndicator,
} from '@nestjs/terminus';
import { Public } from '../modules/auth/decorators/public.decorator';
import { PrismaService } from '@db/prisma.service';
import { RedisService } from '@utils/redis/redis.service';

@ApiTags('health')
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private memory: MemoryHealthIndicator,
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  @Public()
  @Get()
  @HealthCheck()
  @ApiOperation({ summary: 'Health check endpoint' })
  @ApiResponse({ status: 200, description: 'Service is healthy' })
  @ApiResponse({ status: 503, description: 'Service is unhealthy' })
  async check() {
    return this.health.check([
      // Database health check
      async () => ({
        database: {
          status: (await this.prisma.healthCheck()) ? 'up' : 'down',
        },
      }),
      // Redis health check (skip if Redis not available)
      async () => {
        try {
          const redisHealthy = await this.redis.healthCheck();
          return {
            redis: {
              status: redisHealthy ? 'up' : 'down',
            },
          };
        } catch (error) {
          // Redis might not be configured, return as optional service
          return {
            redis: {
              status: 'up', // Mark as up if Redis is optional
            },
          };
        }
      },
      // Memory health check - adjusted for Railway's free tier (512MB)
      () => this.memory.checkHeap('memory_heap', 256 * 1024 * 1024), // 256MB
      () => this.memory.checkRSS('memory_rss', 400 * 1024 * 1024), // 400MB
    ]);
  }

  @Public()
  @Get('live')
  @ApiOperation({ summary: 'Liveness probe - simple health check without dependencies' })
  @ApiResponse({ status: 200, description: 'Service is alive' })
  live() {
    // Simple synchronous response - no async, no dependencies
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'ecomate-api'
    };
  }

  @Public()
  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe' })
  @ApiResponse({ status: 200, description: 'Service is ready' })
  @ApiResponse({ status: 503, description: 'Service is not ready' })
  async ready() {
    const dbHealthy = await this.prisma.healthCheck();
    const redisHealthy = await this.redis.healthCheck();

    if (dbHealthy && redisHealthy) {
      return { status: 'ready', timestamp: new Date().toISOString() };
    }

    throw new Error('Service not ready');
  }
}