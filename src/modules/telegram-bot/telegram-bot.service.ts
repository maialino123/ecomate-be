import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Bot, webhookCallback } from 'grammy';
import { CommandService } from './services/command.service';
import { UserBindingService } from './services/user-binding.service';
import { ReminderService } from './services/reminder.service';
import { PrismaService } from '../../db/prisma.service';

@Injectable()
export class TelegramBotService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramBotService.name);
  private bot: Bot;
  private webhookPath: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly commandService: CommandService,
    private readonly userBindingService: UserBindingService,
    private readonly reminderService: ReminderService,
    private readonly prisma: PrismaService,
  ) {
    const token = this.configService.get<string>('TELEGRAM_BOT_TOKEN');
    if (!token) {
      throw new Error('TELEGRAM_BOT_TOKEN is not configured');
    }

    this.bot = new Bot(token);
    this.webhookPath = this.configService.get<string>('TELEGRAM_WEBHOOK_SECRET') || 'telegram-webhook';
  }

  async onModuleInit() {
    this.logger.log('Initializing Telegram Bot...');

    // Check database connection first
    await this.checkDatabaseConnection();

    // Register middleware
    this.registerMiddleware();

    // Register command handlers
    this.registerCommands();

    // Setup webhook
    await this.setupWebhook();

    // Reschedule pending reminders
    await this.reminderService.reschedulePendingReminders();

    this.logger.log('Telegram Bot initialized successfully');
  }

  /**
   * Check database connection and required tables
   */
  private async checkDatabaseConnection() {
    try {
      this.logger.log('Checking database connection...');

      // Test database connection
      await this.prisma.$queryRaw`SELECT 1`;
      this.logger.log('✓ Database connection successful');

      // Check if TelegramUser table exists
      const result = await this.prisma.$queryRaw<any[]>`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_schema = 'public'
          AND table_name = 'TelegramUser'
        );
      `;

      const tableExists = result[0]?.exists;
      if (!tableExists) {
        throw new Error(
          'TelegramUser table does not exist. Please run: npx prisma db push',
        );
      }
      this.logger.log('✓ TelegramUser table exists');

      // Count existing users
      const userCount = await this.prisma.telegramUser.count();
      this.logger.log(`✓ Found ${userCount} existing Telegram users`);
    } catch (error) {
      this.logger.error('❌ Database connection check failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(
        `Telegram Bot initialization failed: Database is not available or not properly configured. ${errorMessage}`,
      );
    }
  }

  async onModuleDestroy() {
    this.logger.log('Shutting down Telegram Bot...');
    await this.bot.stop();
  }

  /**
   * Register middleware for authentication and logging
   */
  private registerMiddleware() {
    // Logging middleware
    this.bot.use(async (ctx, next) => {
      const start = Date.now();
      const userId = ctx.from?.id;
      const username = ctx.from?.username || 'unknown';
      const messageType = ctx.message?.text || ctx.callbackQuery?.data || 'unknown';

      this.logger.debug(`Incoming update from user ${userId} (@${username}): ${messageType}`);

      await next();

      const duration = Date.now() - start;
      this.logger.debug(`Processed update from ${userId} in ${duration}ms`);
    });

    // User binding middleware - ensure user exists in DB (BEFORE auth check)
    this.bot.use(async (ctx, next) => {
      const user = ctx.from;
      if (!user) {
        this.logger.warn('Received update without user information');
        return;
      }

      try {
        await this.userBindingService.getOrCreateUser(user.id, {
          username: user.username,
          firstName: user.first_name,
          lastName: user.last_name,
        });
        await next();
      } catch (error) {
        this.logger.error(`User binding failed for ${user.id}:`, error);
        try {
          await ctx.reply(
            '❌ Registration failed. Our database might be temporarily unavailable.\n\n' +
            'Please try again in a few moments. If the problem persists, please contact support.',
          );
        } catch (replyError) {
          this.logger.error('Failed to send error message to user:', replyError);
        }
        // Don't call next() - stop processing this update
        return;
      }
    });

    // Authentication middleware - check if user is blocked
    this.bot.use(async (ctx, next) => {
      const userId = ctx.from?.id;
      if (!userId) {
        return;
      }

      try {
        // Check if user is authorized
        const isAuthorized = await this.commandService.isUserAuthorized(userId);
        if (!isAuthorized) {
          this.logger.warn(`Blocked user ${userId} attempted to use bot`);
          await ctx.reply(
            '❌ You are blocked from using this bot.\n\n' +
            'If you believe this is a mistake, please contact support.',
          );
          return;
        }

        await next();
      } catch (error) {
        this.logger.error(`Authorization check failed for ${userId}:`, error);
        // Continue processing - don't block users due to auth check errors
        await next();
      }
    });
  }

  /**
   * Register all bot command handlers
   */
  private registerCommands() {
    // /start command
    this.bot.command('start', async (ctx) => {
      await this.commandService.handleStart(ctx);
    });

    // /help command
    this.bot.command('help', async (ctx) => {
      await this.commandService.handleHelp(ctx);
    });

    // /note command
    this.bot.command('note', async (ctx) => {
      await this.commandService.handleNote(ctx);
    });

    // /todo command
    this.bot.command('todo', async (ctx) => {
      await this.commandService.handleTodo(ctx);
    });

    // /list command
    this.bot.command('list', async (ctx) => {
      await this.commandService.handleList(ctx);
    });

    // /remind command
    this.bot.command('remind', async (ctx) => {
      await this.commandService.handleRemind(ctx);
    });

    // /translate command
    this.bot.command('translate', async (ctx) => {
      await this.commandService.handleTranslate(ctx);
    });

    // Handle unknown commands
    this.bot.on('message:text', async (ctx, next) => {
      const text = ctx.message.text;
      if (text?.startsWith('/')) {
        await this.commandService.handleUnknown(ctx);
      } else {
        await next();
      }
    });

    // Global error handler
    this.bot.catch((err) => {
      const ctx = err.ctx;
      this.logger.error(`Error while handling update ${ctx.update.update_id}:`, err.error);
    });
  }

  /**
   * Setup webhook for receiving updates
   */
  private async setupWebhook() {
    const webhookUrl = this.configService.get<string>('TELEGRAM_WEBHOOK_URL');

    if (!webhookUrl) {
      this.logger.warn('TELEGRAM_WEBHOOK_URL not configured, bot will not receive updates');
      return;
    }

    const fullWebhookUrl = `${webhookUrl}/${this.webhookPath}`;
    const secret = this.configService.get<string>('TELEGRAM_WEBHOOK_SECRET');

    // Validate secret token format (Telegram only allows: A-Z, a-z, 0-9, _, -)
    const isValidSecret = secret &&
                          !secret.includes('$') &&           // No shell commands
                          !secret.includes('your-') &&       // No placeholder text
                          /^[A-Za-z0-9_-]+$/.test(secret);   // Only allowed characters

    const webhookOptions: any = {
      drop_pending_updates: true,
    };

    if (isValidSecret) {
      webhookOptions.secret_token = secret;
      this.logger.log('Webhook will use secret token for security');
    } else {
      this.logger.warn(
        'TELEGRAM_WEBHOOK_SECRET is not set or contains invalid characters - webhook will be less secure. ' +
        'Secret must only contain: A-Z, a-z, 0-9, underscore (_), and hyphen (-)'
      );
    }

    try {
      await this.bot.api.setWebhook(fullWebhookUrl, webhookOptions);
      this.logger.log(`Webhook set to: ${fullWebhookUrl}`);
    } catch (error) {
      this.logger.error('Failed to set webhook:', error);
      throw error;
    }
  }

  /**
   * Get webhook callback for Express/Fastify
   */
  getWebhookCallback() {
    return webhookCallback(this.bot, 'fastify');
  }

  /**
   * Get bot instance
   */
  getBot(): Bot {
    return this.bot;
  }

  /**
   * Get webhook path
   */
  getWebhookPath(): string {
    return this.webhookPath;
  }

  /**
   * Send a message to a specific chat
   */
  async sendMessage(chatId: number, text: string, options?: any) {
    try {
      await this.bot.api.sendMessage(chatId, text, options);
    } catch (error) {
      this.logger.error(`Failed to send message to ${chatId}:`, error);
      throw error;
    }
  }

  /**
   * Get bot info
   */
  async getBotInfo() {
    return this.bot.api.getMe();
  }
}
