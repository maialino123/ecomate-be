import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../../db/prisma.service';
import { TelegramReminder, ReminderStatus } from '@prisma/client';
import { JobQueue, ReminderJobData } from '../interfaces/job.interface';

@Injectable()
export class ReminderService {
  private readonly logger = new Logger(ReminderService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(JobQueue.REMINDERS) private readonly reminderQueue: Queue<ReminderJobData>,
  ) {}

  /**
   * Create a new reminder and schedule it
   */
  async createReminder(
    telegramUserId: number,
    chatId: number,
    message: string,
    remindAt: Date
  ): Promise<TelegramReminder> {
    // Check if remind time is in the future
    if (remindAt <= new Date()) {
      throw new Error('Reminder time must be in the future');
    }

    const reminder = await this.prisma.telegramReminder.create({
      data: {
        telegramUserId: BigInt(telegramUserId),
        message,
        remindAt,
        status: ReminderStatus.SCHEDULED,
      },
    });

    // Schedule the reminder job
    await this.scheduleReminderJob(reminder, chatId);

    this.logger.log(`Reminder created for user ${telegramUserId}: ${reminder.id} at ${remindAt}`);
    return reminder;
  }

  /**
   * Schedule a reminder job in BullMQ
   */
  private async scheduleReminderJob(reminder: TelegramReminder, chatId: number): Promise<void> {
    const delay = reminder.remindAt.getTime() - Date.now();

    await this.reminderQueue.add(
      'send-reminder',
      {
        reminderId: reminder.id,
        telegramUserId: Number(reminder.telegramUserId),
        message: reminder.message,
        chatId,
      },
      {
        delay,
        jobId: `reminder-${reminder.id}`,
        removeOnComplete: true,
        removeOnFail: false,
      }
    );

    this.logger.debug(`Scheduled reminder job ${reminder.id} with delay ${delay}ms`);
  }

  /**
   * Get upcoming reminders for a user
   */
  async getUpcomingReminders(telegramUserId: number, limit: number = 5): Promise<TelegramReminder[]> {
    return this.prisma.telegramReminder.findMany({
      where: {
        telegramUserId: BigInt(telegramUserId),
        status: ReminderStatus.SCHEDULED,
        remindAt: {
          gte: new Date(),
        },
      },
      orderBy: { remindAt: 'asc' },
      take: limit,
    });
  }

  /**
   * Get all reminders for a user
   */
  async getAllReminders(telegramUserId: number, limit: number = 10): Promise<TelegramReminder[]> {
    return this.prisma.telegramReminder.findMany({
      where: { telegramUserId: BigInt(telegramUserId) },
      orderBy: { remindAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Cancel a reminder
   */
  async cancelReminder(reminderId: string): Promise<void> {
    // Update database status
    await this.prisma.telegramReminder.update({
      where: { id: reminderId },
      data: { status: ReminderStatus.CANCELLED },
    });

    // Remove job from queue
    const jobId = `reminder-${reminderId}`;
    const job = await this.reminderQueue.getJob(jobId);
    if (job) {
      await job.remove();
      this.logger.debug(`Removed reminder job ${jobId} from queue`);
    }

    this.logger.log(`Reminder cancelled: ${reminderId}`);
  }

  /**
   * Mark reminder as sent
   */
  async markReminderAsSent(reminderId: string): Promise<void> {
    await this.prisma.telegramReminder.update({
      where: { id: reminderId },
      data: {
        status: ReminderStatus.SENT,
        sentAt: new Date(),
      },
    });
    this.logger.log(`Reminder marked as sent: ${reminderId}`);
  }

  /**
   * Mark reminder as failed
   */
  async markReminderAsFailed(reminderId: string, reason: string): Promise<void> {
    await this.prisma.telegramReminder.update({
      where: { id: reminderId },
      data: {
        status: ReminderStatus.FAILED,
        failedAt: new Date(),
        failureReason: reason,
      },
    });
    this.logger.error(`Reminder failed: ${reminderId} - ${reason}`);
  }

  /**
   * Get reminder by ID
   */
  async getReminderById(reminderId: string): Promise<TelegramReminder | null> {
    return this.prisma.telegramReminder.findUnique({
      where: { id: reminderId },
    });
  }

  /**
   * Count reminders for a user
   */
  async countReminders(telegramUserId: number, status?: ReminderStatus): Promise<number> {
    return this.prisma.telegramReminder.count({
      where: {
        telegramUserId: BigInt(telegramUserId),
        ...(status && { status }),
      },
    });
  }

  /**
   * Reschedule all pending reminders on startup
   */
  async reschedulePendingReminders(): Promise<void> {
    const pendingReminders = await this.prisma.telegramReminder.findMany({
      where: {
        status: ReminderStatus.SCHEDULED,
        remindAt: {
          gte: new Date(),
        },
      },
      include: {
        telegramUser: true,
      },
    });

    this.logger.log(`Rescheduling ${pendingReminders.length} pending reminders`);

    for (const reminder of pendingReminders) {
      try {
        // We don't have chatId stored, so we use telegramUserId as chatId
        // In a real implementation, you might want to store chatId in the reminder
        await this.scheduleReminderJob(reminder, Number(reminder.telegramUserId));
      } catch (error) {
        this.logger.error(`Failed to reschedule reminder ${reminder.id}:`, error);
      }
    }
  }
}
