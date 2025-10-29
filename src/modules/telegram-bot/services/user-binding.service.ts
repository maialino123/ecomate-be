import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../db/prisma.service';
import { TelegramUser as PrismaTelegramUser, TelegramUserStatus } from '@prisma/client';

@Injectable()
export class UserBindingService {
  private readonly logger = new Logger(UserBindingService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get or create a Telegram user
   */
  async getOrCreateUser(telegramUserId: number, userData: {
    username?: string;
    firstName?: string;
    lastName?: string;
  }): Promise<PrismaTelegramUser> {
    try {
      let user = await this.prisma.telegramUser.findUnique({
        where: { telegramUserId: BigInt(telegramUserId) },
      });

      if (!user) {
        this.logger.log(
          `Creating new Telegram user: ${telegramUserId} (@${userData.username || 'no-username'})`,
        );

        try {
          user = await this.prisma.telegramUser.create({
            data: {
              telegramUserId: BigInt(telegramUserId),
              telegramUsername: userData.username,
              telegramFirstName: userData.firstName,
              telegramLastName: userData.lastName,
              status: TelegramUserStatus.ACTIVE,
              language: 'en',
              timezone: 'UTC',
            },
          });
          this.logger.log(`Successfully created Telegram user: ${telegramUserId}`);
        } catch (createError) {
          this.logger.error(
            `Failed to create Telegram user ${telegramUserId}:`,
            createError,
          );
          throw new Error(
            `Database error: Unable to create user. Please try again or contact support.`,
          );
        }
      } else {
        // Update user info if changed
        const updates: any = {};
        if (userData.username && userData.username !== user.telegramUsername) {
          updates.telegramUsername = userData.username;
        }
        if (userData.firstName && userData.firstName !== user.telegramFirstName) {
          updates.telegramFirstName = userData.firstName;
        }
        if (userData.lastName && userData.lastName !== user.telegramLastName) {
          updates.telegramLastName = userData.lastName;
        }
        updates.lastInteractionAt = new Date();

        if (Object.keys(updates).length > 1) {
          // More than just lastInteractionAt
          this.logger.debug(`Updating user info for ${telegramUserId}`);
        }

        if (Object.keys(updates).length > 0) {
          try {
            user = await this.prisma.telegramUser.update({
              where: { telegramUserId: BigInt(telegramUserId) },
              data: updates,
            });
          } catch (updateError) {
            this.logger.error(
              `Failed to update Telegram user ${telegramUserId}:`,
              updateError,
            );
            // Don't throw on update errors, just log them
          }
        }
      }

      return user;
    } catch (error) {
      this.logger.error(
        `Error in getOrCreateUser for ${telegramUserId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Check if user is blocked
   */
  async isUserBlocked(telegramUserId: number): Promise<boolean> {
    const user = await this.prisma.telegramUser.findUnique({
      where: { telegramUserId: BigInt(telegramUserId) },
    });

    return user?.status === TelegramUserStatus.BLOCKED;
  }

  /**
   * Block a user
   */
  async blockUser(telegramUserId: number): Promise<void> {
    await this.prisma.telegramUser.update({
      where: { telegramUserId: BigInt(telegramUserId) },
      data: { status: TelegramUserStatus.BLOCKED },
    });
    this.logger.warn(`Blocked user: ${telegramUserId}`);
  }

  /**
   * Unblock a user
   */
  async unblockUser(telegramUserId: number): Promise<void> {
    await this.prisma.telegramUser.update({
      where: { telegramUserId: BigInt(telegramUserId) },
      data: { status: TelegramUserStatus.ACTIVE },
    });
    this.logger.log(`Unblocked user: ${telegramUserId}`);
  }

  /**
   * Link Telegram user to main User account
   */
  async linkToUser(telegramUserId: number, userId: string): Promise<void> {
    await this.prisma.telegramUser.update({
      where: { telegramUserId: BigInt(telegramUserId) },
      data: { userId },
    });
    this.logger.log(`Linked Telegram user ${telegramUserId} to User ${userId}`);
  }

  /**
   * Update user settings
   */
  async updateUserSettings(telegramUserId: number, settings: {
    language?: string;
    timezone?: string;
    notificationsEnabled?: boolean;
  }): Promise<void> {
    await this.prisma.telegramUser.update({
      where: { telegramUserId: BigInt(telegramUserId) },
      data: settings,
    });
  }

  /**
   * Get user settings
   */
  async getUserSettings(telegramUserId: number) {
    const user = await this.prisma.telegramUser.findUnique({
      where: { telegramUserId: BigInt(telegramUserId) },
      select: {
        language: true,
        timezone: true,
        notificationsEnabled: true,
      },
    });

    return user;
  }
}
