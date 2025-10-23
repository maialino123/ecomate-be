import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '@db/prisma.service';
import { RegistrationStatus } from '@common/enums';

@Injectable()
export class CleanupService {
  private readonly logger = new Logger(CleanupService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Runs every hour to:
   * 1. Mark expired pending registration requests as EXPIRED
   * 2. Delete EXPIRED requests older than 30 days (for audit trail)
   * 3. Clean up old used action tokens
   */
  @Cron(CronExpression.EVERY_HOUR)
  async cleanupExpiredRequests() {
    this.logger.log('Running cleanup job for expired registration requests and tokens...');

    try {
      // 1. Update PENDING requests that have expired to EXPIRED status
      const expiredPendingRequests = await this.prisma.userRegistrationRequest.updateMany({
        where: {
          status: RegistrationStatus.PENDING as any,
          expiresAt: { lt: new Date() },
        },
        data: {
          status: RegistrationStatus.EXPIRED as any,
        },
      });

      if (expiredPendingRequests.count > 0) {
        this.logger.log(`Marked ${expiredPendingRequests.count} pending requests as EXPIRED`);
      }

      // 2. Delete EXPIRED requests older than 30 days (audit trail cleanup)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const deletedExpiredRequests = await this.prisma.userRegistrationRequest.deleteMany({
        where: {
          status: RegistrationStatus.EXPIRED as any,
          updatedAt: { lt: thirtyDaysAgo },
        },
      });

      if (deletedExpiredRequests.count > 0) {
        this.logger.log(
          `Deleted ${deletedExpiredRequests.count} EXPIRED requests older than 30 days`,
        );
      }

      // 3. Clean up used action tokens older than 7 days
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const deletedTokens = await this.prisma.actionToken.deleteMany({
        where: {
          usedAt: { not: null, lt: sevenDaysAgo },
        },
      });

      if (deletedTokens.count > 0) {
        this.logger.log(`Deleted ${deletedTokens.count} old used action tokens`);
      }

      // 4. Clean up expired unused tokens (older than their expiry date + 7 days)
      const deletedExpiredTokens = await this.prisma.actionToken.deleteMany({
        where: {
          usedAt: null,
          expiresAt: { lt: sevenDaysAgo },
        },
      });

      if (deletedExpiredTokens.count > 0) {
        this.logger.log(`Deleted ${deletedExpiredTokens.count} expired unused tokens`);
      }

      this.logger.log('Cleanup job completed successfully');
    } catch (error) {
      this.logger.error('Error during cleanup job:', error);
    }
  }

  /**
   * Runs daily to clean up old refresh tokens
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async cleanupExpiredRefreshTokens() {
    this.logger.log('Running cleanup job for expired refresh tokens...');

    try {
      const deletedTokens = await this.prisma.refreshToken.deleteMany({
        where: {
          expiresAt: { lt: new Date() },
        },
      });

      if (deletedTokens.count > 0) {
        this.logger.log(`Deleted ${deletedTokens.count} expired refresh tokens`);
      }

      this.logger.log('Refresh token cleanup completed');
    } catch (error) {
      this.logger.error('Error during refresh token cleanup:', error);
    }
  }

  /**
   * Runs daily to clean up old sessions
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async cleanupExpiredSessions() {
    this.logger.log('Running cleanup job for expired sessions...');

    try {
      const deletedSessions = await this.prisma.session.deleteMany({
        where: {
          expiresAt: { lt: new Date() },
        },
      });

      if (deletedSessions.count > 0) {
        this.logger.log(`Deleted ${deletedSessions.count} expired sessions`);
      }

      this.logger.log('Session cleanup completed');
    } catch (error) {
      this.logger.error('Error during session cleanup:', error);
    }
  }
}
