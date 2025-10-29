import { TelegramContext } from './telegram.interface';

export enum BotCommand {
  START = '/start',
  NOTE = '/note',
  TODO = '/todo',
  LIST = '/list',
  REMIND = '/remind',
  TRANSLATE = '/translate',
  HELP = '/help',
}

export interface CommandHandler {
  execute(ctx: TelegramContext, args?: string): Promise<void>;
}

export interface CommandMetadata {
  command: BotCommand;
  description: string;
  usage: string;
  examples?: string[];
}
