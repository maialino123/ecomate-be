import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { TelegramBotService } from './telegram-bot.service';
import { TelegramBotController } from './telegram-bot.controller';
import { CommandService } from './services/command.service';
import { NoteService } from './services/note.service';
import { TodoService } from './services/todo.service';
import { ReminderService } from './services/reminder.service';
import { UserBindingService } from './services/user-binding.service';
import { ReminderProcessor } from './processors/reminder.processor';
import { JobQueue } from './interfaces/job.interface';
import { PrismaService } from '../../db/prisma.service';
import { TranslationModule } from '../translation/translation.module';

@Module({
  imports: [
    ConfigModule,
    TranslationModule,
    // Register BullMQ queue for reminders
    BullModule.registerQueue({
      name: JobQueue.REMINDERS,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        removeOnComplete: {
          age: 3600, // Keep completed jobs for 1 hour
          count: 100,
        },
        removeOnFail: {
          age: 86400, // Keep failed jobs for 24 hours
        },
      },
    }),
  ],
  controllers: [TelegramBotController],
  providers: [
    // Core service
    TelegramBotService,

    // Command handler
    CommandService,

    // Feature services
    NoteService,
    TodoService,
    ReminderService,
    UserBindingService,

    // Job processors
    ReminderProcessor,

    // Database
    PrismaService,
  ],
  exports: [TelegramBotService],
})
export class TelegramBotModule {}
