import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../db/prisma.service';
import { TelegramNote } from '@prisma/client';

@Injectable()
export class NoteService {
  private readonly logger = new Logger(NoteService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new note
   */
  async createNote(telegramUserId: number, content: string, tags?: string[]): Promise<TelegramNote> {
    const note = await this.prisma.telegramNote.create({
      data: {
        telegramUserId: BigInt(telegramUserId),
        content,
        tags: tags || [],
      },
    });

    this.logger.log(`Note created for user ${telegramUserId}: ${note.id}`);
    return note;
  }

  /**
   * Get recent notes for a user
   */
  async getRecentNotes(telegramUserId: number, limit: number = 5): Promise<TelegramNote[]> {
    return this.prisma.telegramNote.findMany({
      where: { telegramUserId: BigInt(telegramUserId) },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Search notes by content
   */
  async searchNotes(telegramUserId: number, query: string, limit: number = 10): Promise<TelegramNote[]> {
    return this.prisma.telegramNote.findMany({
      where: {
        telegramUserId: BigInt(telegramUserId),
        content: {
          contains: query,
          mode: 'insensitive',
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Get notes by tags
   */
  async getNotesByTags(telegramUserId: number, tags: string[], limit: number = 10): Promise<TelegramNote[]> {
    return this.prisma.telegramNote.findMany({
      where: {
        telegramUserId: BigInt(telegramUserId),
        tags: {
          hasSome: tags,
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Get note by ID
   */
  async getNoteById(noteId: string): Promise<TelegramNote | null> {
    return this.prisma.telegramNote.findUnique({
      where: { id: noteId },
    });
  }

  /**
   * Delete a note
   */
  async deleteNote(noteId: string): Promise<void> {
    await this.prisma.telegramNote.delete({
      where: { id: noteId },
    });
    this.logger.log(`Note deleted: ${noteId}`);
  }

  /**
   * Update a note
   */
  async updateNote(noteId: string, content: string, tags?: string[]): Promise<TelegramNote> {
    const updates: any = { content };
    if (tags) {
      updates.tags = tags;
    }

    return this.prisma.telegramNote.update({
      where: { id: noteId },
      data: updates,
    });
  }

  /**
   * Count notes for a user
   */
  async countNotes(telegramUserId: number): Promise<number> {
    return this.prisma.telegramNote.count({
      where: { telegramUserId: BigInt(telegramUserId) },
    });
  }
}
