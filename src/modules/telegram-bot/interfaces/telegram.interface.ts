import { Context } from 'grammy';

export interface TelegramContext extends Context {
  // Extended context for our bot
}

export interface TelegramUser {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: {
    id: number;
    type: string;
  };
  text?: string;
  date: number;
}

export interface WebhookRequest {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: any;
}
