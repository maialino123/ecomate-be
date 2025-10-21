import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { EnvService } from '@env/env.service';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(private envService: EnvService) {
    const logLevel = envService.isDevelopment() ? ['query', 'info', 'warn', 'error'] : ['error'];

    super({
      datasources: {
        db: {
          url: envService.getDatabaseUrl(),
        },
      },
      log: logLevel as any,
      errorFormat: envService.isDevelopment() ? 'pretty' : 'minimal',
    });

    // Log query events in development
    if (envService.isDevelopment()) {
      (this as any).$on('query', (e: any) => {
        this.logger.debug(`Query: ${e.query}`);
        this.logger.debug(`Duration: ${e.duration}ms`);
      });
    }
  }

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log('Database connected successfully');
    } catch (error) {
      this.logger.error('Failed to connect to database', error);
      throw error;
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('Database disconnected');
  }

  async cleanDatabase() {
    if (this.envService.isProduction()) {
      throw new Error('cleanDatabase is not allowed in production');
    }

    const models = Object.keys(this).filter(
      (key) =>
        !key.startsWith('_') && !key.startsWith('$') && typeof (this as any)[key] === 'object',
    );

    return Promise.all(models.map((model) => (this as any)[model].deleteMany()));
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
