import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Bot, webhookCallback, Context } from 'grammy';
import { CommandService } from './services/command.service';
import { UserBindingService } from './services/user-binding.service';
import { ReminderService } from './services/reminder.service';

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
      await next();
      const duration = Date.now() - start;
      this.logger.debug(`Processed update in ${duration}ms`);
    });

    // Authentication middleware
    this.bot.use(async (ctx, next) => {
      const userId = ctx.from?.id;
      if (!userId) {
        return;
      }

      // Check if user is authorized
      const isAuthorized = await this.commandService.isUserAuthorized(userId);
      if (!isAuthorized) {
        await ctx.reply('❌ You are blocked from using this bot.');
        return;
      }

      await next();
    });

    // User binding middleware - ensure user exists in DB
    this.bot.use(async (ctx, next) => {
      const user = ctx.from;
      if (user) {
        await this.userBindingService.getOrCreateUser(user.id, {
          username: user.username,
          firstName: user.first_name,
          lastName: user.last_name,
        });
      }
      await next();
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
