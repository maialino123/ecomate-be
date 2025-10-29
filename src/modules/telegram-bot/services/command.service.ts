import { Injectable, Logger } from '@nestjs/common';
import { Context } from 'grammy';
import { NoteService } from './note.service';
import { TodoService } from './todo.service';
import { ReminderService } from './reminder.service';
import { UserBindingService } from './user-binding.service';
import { TranslationService } from '../../translation/translation.service';
import { BotCommand } from '../interfaces/command.interface';
import { escapeHtml } from '../utils/message-formatter';
import chrono from 'chrono-node';

@Injectable()
export class CommandService {
  private readonly logger = new Logger(CommandService.name);

  constructor(
    private readonly noteService: NoteService,
    private readonly todoService: TodoService,
    private readonly reminderService: ReminderService,
    private readonly userBindingService: UserBindingService,
    private readonly translationService: TranslationService,
  ) {}

  /**
   * Handle /start command
   */
  async handleStart(ctx: Context): Promise<void> {
    const user = ctx.from;
    if (!user) return;

    try {
      // Verify user is properly registered
      const telegramUser = await this.userBindingService.getOrCreateUser(user.id, {
        username: user.username,
        firstName: user.first_name,
        lastName: user.last_name,
      });

      const isNewUser = !telegramUser.lastInteractionAt ||
                        Date.now() - telegramUser.lastInteractionAt.getTime() < 5000;

      const welcomeMessage = isNewUser
        ? `
👋 Welcome to your Personal Assistant Bot, ${user.first_name || 'there'}!

✅ Your account has been successfully registered.

I can help you with:
• 📝 Taking notes - /note <text>
• ✅ Managing todos - /todo <task>
• ⏰ Setting reminders - /remind <time> <message>
• 🌐 Translating text - /translate <text>
• 📋 Viewing your items - /list

Use /help to see detailed command instructions.

Let's get started! 🚀
`
        : `
👋 Welcome back, ${user.first_name || 'there'}!

I'm here to help you with notes, todos, reminders, and translations.

Use /help to see all available commands.
`;

      await ctx.reply(welcomeMessage);
      this.logger.log(
        `User ${user.id} (@${user.username || 'no-username'}) ${isNewUser ? 'registered and' : ''} started the bot`,
      );
    } catch (error) {
      this.logger.error(`Failed to handle /start for user ${user.id}:`, error);
      await ctx.reply(
        '❌ An error occurred while registering your account.\n\n' +
        'Please try again. If the problem persists, the database may be temporarily unavailable.',
      );
    }
  }

  /**
   * Handle /note command
   */
  async handleNote(ctx: Context): Promise<void> {
    const user = ctx.from;
    if (!user) return;

    const text = ctx.message?.text || '';
    const content = text.replace(/^\/note\s*/, '').trim();

    if (!content) {
      await ctx.reply('Usage: /note <your note>\nExample: /note Remember to buy groceries');
      return;
    }

    try {
      const note = await this.noteService.createNote(user.id, content);
      await ctx.reply(`✅ Note saved! (ID: ${note.id.substring(0, 8)})`);
    } catch (error) {
      this.logger.error('Failed to create note:', error);
      await ctx.reply('❌ Failed to save note. Please try again.');
    }
  }

  /**
   * Handle /todo command
   */
  async handleTodo(ctx: Context): Promise<void> {
    const user = ctx.from;
    if (!user) return;

    const text = ctx.message?.text || '';
    const content = text.replace(/^\/todo\s*/, '').trim();

    if (!content) {
      await ctx.reply('Usage: /todo <your task>\nExample: /todo Finish project report');
      return;
    }

    try {
      const todo = await this.todoService.createTodo(user.id, content);
      await ctx.reply(`✅ Todo added! (ID: ${todo.id.substring(0, 8)})`);
    } catch (error) {
      this.logger.error('Failed to create todo:', error);
      await ctx.reply('❌ Failed to add todo. Please try again.');
    }
  }

  /**
   * Handle /list command
   */
  async handleList(ctx: Context): Promise<void> {
    const user = ctx.from;
    if (!user) return;

    try {
      const [recentNotes, activeTodos, upcomingReminders] = await Promise.all([
        this.noteService.getRecentNotes(user.id, 5),
        this.todoService.getActiveTodos(user.id, 5),
        this.reminderService.getUpcomingReminders(user.id, 5),
      ]);

      let message = '📋 Your Recent Items:\n\n';

      // Notes section
      if (recentNotes.length > 0) {
        message += '📝 <b>Recent Notes:</b>\n';
        recentNotes.forEach((note, index) => {
          const preview = note.content.length > 50
            ? note.content.substring(0, 50) + '...'
            : note.content;
          message += `${index + 1}. ${escapeHtml(preview)}\n`;
        });
        message += '\n';
      } else {
        message += '📝 No notes yet.\n\n';
      }

      // Todos section
      if (activeTodos.length > 0) {
        message += '✅ <b>Active Todos:</b>\n';
        activeTodos.forEach((todo, index) => {
          const checkbox = todo.completed ? '☑️' : '☐';
          const preview = todo.content.length > 50
            ? todo.content.substring(0, 50) + '...'
            : todo.content;
          message += `${checkbox} ${index + 1}. ${escapeHtml(preview)}\n`;
        });
        message += '\n';
      } else {
        message += '✅ No active todos.\n\n';
      }

      // Reminders section
      if (upcomingReminders.length > 0) {
        message += '⏰ <b>Upcoming Reminders:</b>\n';
        upcomingReminders.forEach((reminder, index) => {
          const timeStr = this.formatDateTime(reminder.remindAt);
          const preview = reminder.message.length > 40
            ? reminder.message.substring(0, 40) + '...'
            : reminder.message;
          message += `${index + 1}. ${escapeHtml(preview)} (${timeStr})\n`;
        });
      } else {
        message += '⏰ No upcoming reminders.\n';
      }

      await ctx.reply(message, { parse_mode: 'HTML' });
    } catch (error) {
      this.logger.error('Failed to list items:', error);
      await ctx.reply('❌ Failed to retrieve your items. Please try again.');
    }
  }

  /**
   * Handle /remind command
   */
  async handleRemind(ctx: Context): Promise<void> {
    const user = ctx.from;
    const chatId = ctx.chat?.id;
    if (!user || !chatId) return;

    const text = ctx.message?.text || '';
    const args = text.replace(/^\/remind\s*/, '').trim();

    if (!args) {
      await ctx.reply(
        'Usage: /remind <time> <message>\n\n' +
        'Examples:\n' +
        '• /remind tomorrow at 9am Take medicine\n' +
        '• /remind in 2 hours Check email\n' +
        '• /remind next Monday Call John'
      );
      return;
    }

    try {
      // Parse the time using chrono-node
      const parsed = chrono.parse(args);

      if (parsed.length === 0) {
        await ctx.reply('❌ Could not understand the time. Please try again.\n\nExample: /remind tomorrow at 3pm Meeting');
        return;
      }

      const remindAt = parsed[0].start.date();
      const message = args.replace(parsed[0].text, '').trim();

      if (!message) {
        await ctx.reply('❌ Please include a message for the reminder.');
        return;
      }

      if (remindAt <= new Date()) {
        await ctx.reply('❌ Reminder time must be in the future.');
        return;
      }

      const reminder = await this.reminderService.createReminder(user.id, chatId, message, remindAt);
      const timeStr = this.formatDateTime(remindAt);

      await ctx.reply(`⏰ Reminder set for ${timeStr}:\n${escapeHtml(message)}`, {
        parse_mode: 'HTML',
      });
    } catch (error) {
      this.logger.error('Failed to create reminder:', error);
      await ctx.reply('❌ Failed to set reminder. Please try again.');
    }
  }

  /**
   * Handle /translate command
   */
  async handleTranslate(ctx: Context): Promise<void> {
    const user = ctx.from;
    if (!user) return;

    const text = ctx.message?.text || '';
    const content = text.replace(/^\/translate\s*/, '').trim();

    if (!content) {
      await ctx.reply('Usage: /translate <text>\nExample: /translate Hello, how are you?');
      return;
    }

    try {
      await ctx.reply('🔄 Translating...');

      // Use the existing translation service
      // Detect source language and translate to Vietnamese (or user's preferred language)
      const result = await this.translationService.translateText(content, 'auto', 'vi', false);

      await ctx.reply(`🌐 Translation:\n\n${result.text}`);
    } catch (error) {
      this.logger.error('Failed to translate:', error);
      await ctx.reply('❌ Translation failed. Please try again.');
    }
  }

  /**
   * Handle /help command
   */
  async handleHelp(ctx: Context): Promise<void> {
    const helpMessage = `
🤖 <b>Bot Commands Help</b>

<b>📝 Notes</b>
/note &lt;text&gt; - Save a quick note
Example: /note Remember to buy milk

<b>✅ Todos</b>
/todo &lt;task&gt; - Add a new task
Example: /todo Finish project report

<b>📋 List</b>
/list - Show your recent notes, todos, and reminders

<b>⏰ Reminders</b>
/remind &lt;time&gt; &lt;message&gt; - Set a reminder
Examples:
• /remind tomorrow at 9am Take medicine
• /remind in 2 hours Check email
• /remind next Monday Call John

<b>🌐 Translation</b>
/translate &lt;text&gt; - Translate text
Example: /translate Hello, how are you?

<b>ℹ️ Info</b>
/help - Show this help message
/start - Restart the bot

---
Need help? Contact support or check the documentation.
`;

    await ctx.reply(helpMessage, { parse_mode: 'HTML' });
  }

  /**
   * Handle unknown commands
   */
  async handleUnknown(ctx: Context): Promise<void> {
    await ctx.reply(
      '❓ Unknown command. Use /help to see available commands.'
    );
  }

  /**
   * Check if user is authorized (not blocked)
   */
  async isUserAuthorized(userId: number): Promise<boolean> {
    const isBlocked = await this.userBindingService.isUserBlocked(userId);
    return !isBlocked;
  }

  /**
   * Format date/time for display
   */
  private formatDateTime(date: Date): string {
    const now = new Date();
    const diff = date.getTime() - now.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (days > 0) {
      return `in ${days} day${days > 1 ? 's' : ''}, ${hours}h`;
    } else if (hours > 0) {
      return `in ${hours}h ${minutes}m`;
    } else {
      return `in ${minutes} minute${minutes !== 1 ? 's' : ''}`;
    }
  }
}
