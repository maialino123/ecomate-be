export enum JobQueue {
  REMINDERS = 'telegram-reminders',
  TRANSLATIONS = 'telegram-translations',
}

export interface ReminderJobData {
  reminderId: string;
  telegramUserId: number;
  message: string;
  chatId: number;
}

export interface TranslationJobData {
  text: string;
  sourceLang: string;
  targetLang: string;
  chatId: number;
  messageId: number;
}
