import { Injectable, LoggerService as NestLoggerService } from '@nestjs/common';
import * as winston from 'winston';
import { EnvService } from '@env/env.service';

@Injectable()
export class LoggerService implements NestLoggerService {
  private logger: winston.Logger;

  constructor(private envService: EnvService) {
    const logLevel = this.envService.get('LOG_LEVEL');
    const isPretty = this.envService.get('LOG_PRETTY');

    const formats = [
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
    ];

    if (isPretty) {
      formats.push(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, context, ...meta }) => {
          const contextStr = context ? `[${context}] ` : '';
          const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
          return `${timestamp} ${level}: ${contextStr}${message}${metaStr}`;
        }),
      );
    } else {
      formats.push(winston.format.json());
    }

    // In production (Railway/Docker), only use console logging
    // The platform (Railway) captures stdout/stderr to centralized logging
    // File logging in containers causes permission issues with non-root user
    const transports: winston.transport[] = [
      new winston.transports.Console(),
    ];

    // Only add file logging in development (optional, requires logs/ directory)
    if (!this.envService.isProduction()) {
      try {
        transports.push(
          new winston.transports.File({
            filename: 'logs/error.log',
            level: 'error',
          }),
          new winston.transports.File({
            filename: 'logs/combined.log',
          }),
        );
      } catch (error) {
        // Fallback to console-only if file creation fails
        console.warn('⚠️  Could not create log files, using console-only logging');
      }
    }

    this.logger = winston.createLogger({
      level: logLevel,
      format: winston.format.combine(...formats),
      transports,
    });
  }

  log(message: string, context?: string): void {
    this.logger.info(message, { context });
  }

  error(message: string, trace?: string, context?: string): void {
    this.logger.error(message, { trace, context });
  }

  warn(message: string, context?: string): void {
    this.logger.warn(message, { context });
  }

  debug(message: string, context?: string): void {
    this.logger.debug(message, { context });
  }

  verbose(message: string, context?: string): void {
    this.logger.verbose(message, { context });
  }

  setContext(context: string): void {
    // Context is passed per method call
  }
}