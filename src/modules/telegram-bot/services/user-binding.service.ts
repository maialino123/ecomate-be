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
    let user = await this.prisma.telegramUser.findUnique({
      where: { telegramUserId: BigInt(telegramUserId) },
    });

    if (!user) {
      this.logger.log(`Creating new Telegram user: ${telegramUserId}`);
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

      if (Object.keys(updates).length > 0) {
        user = await this.prisma.telegramUser.update({
          where: { telegramUserId: BigInt(telegramUserId) },
          data: updates,
        });
      }
    }

    return user;
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
