import { Controller, Post, Req, Res, Headers, HttpStatus, Logger, UseGuards } from '@nestjs/common';
import { FastifyRequest, FastifyReply } from 'fastify';
import { Update } from 'grammy/types';
import { TelegramBotService } from './telegram-bot.service';
import { ConfigService } from '@nestjs/config';
import { Public } from '../auth/decorators/public.decorator';

@Controller('telegram')
export class TelegramBotController {
  private readonly logger = new Logger(TelegramBotController.name);

  constructor(
    private readonly telegramBotService: TelegramBotService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Webhook endpoint for receiving Telegram updates
   */
  @Public()
  @Post('webhook/:secret')
  async handleWebhook(
    @Req() req: FastifyRequest,
    @Res() res: FastifyReply,
    @Headers('x-telegram-bot-api-secret-token') secretToken?: string,
  ) {
    // Verify secret token
    const expectedSecret = this.configService.get<string>('TELEGRAM_WEBHOOK_SECRET');
    if (expectedSecret && secretToken !== expectedSecret) {
      this.logger.warn('Invalid webhook secret token');
      return res.status(HttpStatus.FORBIDDEN).send({ error: 'Invalid secret token' });
    }

    try {
      // Validate request body
      if (!req.body || typeof req.body !== 'object') {
        this.logger.warn('Invalid webhook body received');
        return res.status(HttpStatus.BAD_REQUEST).send({ error: 'Invalid request body' });
      }

      // Log incoming update for debugging
      const update = req.body as Update;
      const updateType = update.message ? 'message' : update.callback_query ? 'callback' : 'other';
      this.logger.debug(`Processing webhook update: type=${updateType}, update_id=${update.update_id}`);

      // Process update with Telegram bot
      const bot = this.telegramBotService.getBot();
      await bot.handleUpdate(update);

      this.logger.debug(`Webhook update ${update.update_id} processed successfully`);
      return res.status(HttpStatus.OK).send();
    } catch (error) {
      // Detailed error logging for debugging
      const errorDetails = {
        message: error instanceof Error ? error.message : String(error),
        name: error instanceof Error ? error.name : typeof error,
        stack: error instanceof Error ? error.stack : undefined,
        updateId: (req.body as any)?.update_id,
      };

      this.logger.error('Error processing webhook:', errorDetails);
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).send({ error: 'Internal server error' });
    }
  }

  /**
   * Health check endpoint
   */
  @Public()
  @Post('health')
  async healthCheck() {
    try {
      const botInfo = await this.telegramBotService.getBotInfo();
      return {
        status: 'ok',
        bot: {
          id: botInfo.id,
          username: botInfo.username,
          first_name: botInfo.first_name,
        },
      };
    } catch (error) {
      this.logger.error('Health check failed:', error);
      return {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
