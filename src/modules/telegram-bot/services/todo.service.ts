import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../db/prisma.service';
import { TelegramTodo, TodoPriority } from '@prisma/client';

@Injectable()
export class TodoService {
  private readonly logger = new Logger(TodoService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new todo
   */
  async createTodo(
    telegramUserId: number,
    content: string,
    options?: {
      dueDate?: Date;
      priority?: TodoPriority;
      tags?: string[];
    }
  ): Promise<TelegramTodo> {
    const todo = await this.prisma.telegramTodo.create({
      data: {
        telegramUserId: BigInt(telegramUserId),
        content,
        dueDate: options?.dueDate,
        priority: options?.priority || TodoPriority.MEDIUM,
        tags: options?.tags || [],
      },
    });

    this.logger.log(`Todo created for user ${telegramUserId}: ${todo.id}`);
    return todo;
  }

  /**
   * Get active todos (not completed)
   */
  async getActiveTodos(telegramUserId: number, limit: number = 10): Promise<TelegramTodo[]> {
    return this.prisma.telegramTodo.findMany({
      where: {
        telegramUserId: BigInt(telegramUserId),
        completed: false,
      },
      orderBy: [
        { priority: 'desc' },
        { dueDate: 'asc' },
        { createdAt: 'desc' },
      ],
      take: limit,
    });
  }

  /**
   * Get recent todos (including completed)
   */
  async getRecentTodos(telegramUserId: number, limit: number = 5): Promise<TelegramTodo[]> {
    return this.prisma.telegramTodo.findMany({
      where: { telegramUserId: BigInt(telegramUserId) },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Get overdue todos
   */
  async getOverdueTodos(telegramUserId: number): Promise<TelegramTodo[]> {
    return this.prisma.telegramTodo.findMany({
      where: {
        telegramUserId: BigInt(telegramUserId),
        completed: false,
        dueDate: {
          lt: new Date(),
        },
      },
      orderBy: { dueDate: 'asc' },
    });
  }

  /**
   * Mark todo as completed
   */
  async completeTodo(todoId: string): Promise<TelegramTodo> {
    const todo = await this.prisma.telegramTodo.update({
      where: { id: todoId },
      data: {
        completed: true,
        completedAt: new Date(),
      },
    });

    this.logger.log(`Todo completed: ${todoId}`);
    return todo;
  }

  /**
   * Mark todo as incomplete
   */
  async uncompleteTodo(todoId: string): Promise<TelegramTodo> {
    return this.prisma.telegramTodo.update({
      where: { id: todoId },
      data: {
        completed: false,
        completedAt: null,
      },
    });
  }

  /**
   * Update todo
   */
  async updateTodo(
    todoId: string,
    updates: {
      content?: string;
      dueDate?: Date | null;
      priority?: TodoPriority;
      tags?: string[];
    }
  ): Promise<TelegramTodo> {
    return this.prisma.telegramTodo.update({
      where: { id: todoId },
      data: updates,
    });
  }

  /**
   * Delete todo
   */
  async deleteTodo(todoId: string): Promise<void> {
    await this.prisma.telegramTodo.delete({
      where: { id: todoId },
    });
    this.logger.log(`Todo deleted: ${todoId}`);
  }

  /**
   * Get todo by ID
   */
  async getTodoById(todoId: string): Promise<TelegramTodo | null> {
    return this.prisma.telegramTodo.findUnique({
      where: { id: todoId },
    });
  }

  /**
   * Count todos for a user
   */
  async countTodos(telegramUserId: number, completed?: boolean): Promise<number> {
    return this.prisma.telegramTodo.count({
      where: {
        telegramUserId: BigInt(telegramUserId),
        ...(completed !== undefined && { completed }),
      },
    });
  }

  /**
   * Search todos by content
   */
  async searchTodos(telegramUserId: number, query: string, limit: number = 10): Promise<TelegramTodo[]> {
    return this.prisma.telegramTodo.findMany({
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
}
