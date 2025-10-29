import { Controller, Post, Req, Res, Headers, HttpStatus, Logger, UseGuards } from '@nestjs/common';
import { FastifyRequest, FastifyReply } from 'fastify';
import { Update } from 'grammy/types';
import { TelegramBotService } from './telegram-bot.service';
import { ConfigService } from '@nestjs/config';

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
      // Process update with Telegram bot
      const bot = this.telegramBotService.getBot();
      await bot.handleUpdate(req.body as Update);
      return res.status(HttpStatus.OK).send();
    } catch (error) {
      this.logger.error('Error processing webhook:', error);
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).send({ error: 'Internal server error' });
    }
  }

  /**
   * Health check endpoint
   */
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
