import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { JobQueue, ReminderJobData } from '../interfaces/job.interface';
import { ReminderService } from '../services/reminder.service';
import { Bot } from 'grammy';
import { ConfigService } from '@nestjs/config';
import { escapeHtml } from '../utils/message-formatter';

@Processor(JobQueue.REMINDERS)
export class ReminderProcessor extends WorkerHost {
  private readonly logger = new Logger(ReminderProcessor.name);
  private bot: Bot;

  constructor(
    private readonly reminderService: ReminderService,
    private readonly configService: ConfigService,
  ) {
    super();

    // Initialize bot for sending messages
    const token = this.configService.get<string>('TELEGRAM_BOT_TOKEN');
    if (!token) {
      throw new Error('TELEGRAM_BOT_TOKEN is not configured');
    }
    this.bot = new Bot(token);
  }

  async process(job: Job<ReminderJobData>): Promise<void> {
    const { reminderId, telegramUserId, message, chatId } = job.data;

    this.logger.log(`Processing reminder ${reminderId} for user ${telegramUserId}`);

    try {
      // Try to send with HTML formatting first (escaped for safety)
      const formattedMessage = `⏰ <b>Reminder:</b>\n\n${escapeHtml(message)}`;

      try {
        await this.bot.api.sendMessage(chatId, formattedMessage, {
          parse_mode: 'HTML',
        });
      } catch (sendError: any) {
        // If HTML parse error, fallback to plain text
        if (sendError.description?.includes("can't parse entities")) {
          this.logger.warn(
            `HTML parse failed for reminder ${reminderId}, falling back to plain text`
          );
          await this.bot.api.sendMessage(chatId, `⏰ Reminder:\n\n${message}`);
        } else {
          // Re-throw other errors (network, permissions, etc.)
          throw sendError;
        }
      }

      // Mark reminder as sent
      await this.reminderService.markReminderAsSent(reminderId);

      this.logger.log(`Reminder ${reminderId} sent successfully`);
    } catch (error) {
      this.logger.error(`Failed to send reminder ${reminderId}:`, error);

      // Mark reminder as failed
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await this.reminderService.markReminderAsFailed(reminderId, errorMessage);

      throw error; // Re-throw to mark job as failed
    }
  }
}
