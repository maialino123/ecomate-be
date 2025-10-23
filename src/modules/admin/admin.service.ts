import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '@db/prisma.service';
import { UserRole, RegistrationStatus, UserStatus } from '@common/enums';
import * as bcrypt from 'bcrypt';
import { BulkImportUserDto } from './dto/admin.dto';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Get all registration requests with optional filtering
   */
  async getRegistrationRequests(status?: RegistrationStatus, email?: string) {
    return this.prisma.userRegistrationRequest.findMany({
      where: {
        ...(status && { status }),
        ...(email && { email: { contains: email, mode: 'insensitive' } }),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get a single registration request by ID
   */
  async getRegistrationRequestById(id: string) {
    const request = await this.prisma.userRegistrationRequest.findUnique({
      where: { id },
    });

    if (!request) {
      throw new NotFoundException('Registration request not found');
    }

    return request;
  }

  /**
   * Manually approve a registration request from admin panel
   */
  async approveRequest(id: string, role?: UserRole) {
    const request = await this.prisma.userRegistrationRequest.findUnique({
      where: { id },
    });

    if (!request) {
      throw new NotFoundException('Registration request not found');
    }

    if (request.status !== RegistrationStatus.PENDING) {
      throw new BadRequestException('Request has already been processed');
    }

    const assignedRole = role || UserRole.VIEWER;

    if (assignedRole === UserRole.OWNER) {
      throw new BadRequestException('Cannot assign OWNER role');
    }

    // Create user
    const user = await this.prisma.user.create({
      data: {
        email: request.email,
        username: request.username,
        password: request.password,
        firstName: request.firstName,
        lastName: request.lastName,
        role: assignedRole as any,
        status: UserStatus.ACTIVE as any,
      },
    });

    // Delete the registration request
    await this.prisma.userRegistrationRequest.delete({
      where: { id },
    });

    // Mark token as used if exists
    if (request.actionTokenId) {
      await this.prisma.actionToken.updateMany({
        where: { id: request.actionTokenId },
        data: { usedAt: new Date() },
      });
    }

    this.logger.log(`Admin manually approved user ${user.email} with role ${assignedRole}`);

    return user;
  }

  /**
   * Manually reject a registration request from admin panel
   */
  async rejectRequest(id: string, reason?: string) {
    const request = await this.prisma.userRegistrationRequest.findUnique({
      where: { id },
    });

    if (!request) {
      throw new NotFoundException('Registration request not found');
    }

    if (request.status !== RegistrationStatus.PENDING) {
      throw new BadRequestException('Request has already been processed');
    }

    // Update request status
    const updatedRequest = await this.prisma.userRegistrationRequest.update({
      where: { id },
      data: {
        status: RegistrationStatus.REJECTED as any,
        rejectedAt: new Date(),
        rejectionReason: reason,
      },
    });

    // Mark token as used if exists
    if (request.actionTokenId) {
      await this.prisma.actionToken.updateMany({
        where: { id: request.actionTokenId },
        data: { usedAt: new Date() },
      });
    }

    this.logger.log(`Admin manually rejected registration request for ${request.email}`);

    return updatedRequest;
  }

  /**
   * Get all users with optional filtering
   */
  async getUsers() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        email: true,
        username: true,
        firstName: true,
        lastName: true,
        avatar: true,
        role: true,
        status: true,
        require2FA: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get a single user by ID
   */
  async getUserById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        username: true,
        firstName: true,
        lastName: true,
        avatar: true,
        role: true,
        status: true,
        require2FA: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  /**
   * Update user role
   */
  async updateUserRole(id: string, role: UserRole) {
    const user = await this.prisma.user.findUnique({ where: { id } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.role === UserRole.OWNER) {
      throw new BadRequestException('Cannot change OWNER role');
    }

    if (role === UserRole.OWNER) {
      throw new BadRequestException('Cannot assign OWNER role');
    }

    const updatedUser = await this.prisma.user.update({
      where: { id },
      data: { role },
      select: {
        id: true,
        email: true,
        username: true,
        firstName: true,
        lastName: true,
        role: true,
        status: true,
      },
    });

    this.logger.log(`User ${updatedUser.email} role updated to ${role}`);

    return updatedUser;
  }

  /**
   * Update user status
   */
  async updateUserStatus(id: string, status: UserStatus) {
    const user = await this.prisma.user.findUnique({ where: { id } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.role === UserRole.OWNER) {
      throw new BadRequestException('Cannot change OWNER status');
    }

    const updatedUser = await this.prisma.user.update({
      where: { id },
      data: { status },
      select: {
        id: true,
        email: true,
        username: true,
        firstName: true,
        lastName: true,
        role: true,
        status: true,
      },
    });

    this.logger.log(`User ${updatedUser.email} status updated to ${status}`);

    return updatedUser;
  }

  /**
   * Delete user (soft delete by setting status to INACTIVE)
   */
  async deleteUser(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.role === UserRole.OWNER) {
      throw new BadRequestException('Cannot delete OWNER user');
    }

    await this.prisma.user.delete({ where: { id } });

    this.logger.log(`User ${user.email} deleted`);

    return { message: 'User deleted successfully' };
  }

  /**
   * Export registration requests to JSON
   */
  async exportRegistrationRequests(format: 'json' | 'csv' = 'json') {
    const requests = await this.prisma.userRegistrationRequest.findMany({
      orderBy: { createdAt: 'desc' },
    });

    if (format === 'csv') {
      // Simple CSV generation
      const headers = ['Email', 'First Name', 'Last Name', 'Status', 'Created At', 'Expires At'];
      const rows = requests.map((r) => [
        r.email,
        r.firstName || '',
        r.lastName || '',
        r.status,
        r.createdAt.toISOString(),
        r.expiresAt.toISOString(),
      ]);

      return {
        headers,
        rows,
        csv: [headers.join(','), ...rows.map((row) => row.join(','))].join('\n'),
      };
    }

    return requests;
  }

  /**
   * Bulk import users (skip approval flow)
   */
  async bulkImportUsers(users: BulkImportUserDto[]) {
    const results = {
      success: [] as string[],
      failed: [] as { email: string; reason: string }[],
    };

    for (const userData of users) {
      try {
        // Check if user exists
        const existing = await this.prisma.user.findFirst({
          where: {
            OR: [
              { email: userData.email },
              userData.username ? { username: userData.username } : {},
            ],
          },
        });

        if (existing) {
          results.failed.push({
            email: userData.email,
            reason: 'User already exists',
          });
          continue;
        }

        if (userData.role === UserRole.OWNER) {
          results.failed.push({
            email: userData.email,
            reason: 'Cannot import OWNER role',
          });
          continue;
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(userData.password, 10);

        // Create user
        await this.prisma.user.create({
          data: {
            email: userData.email,
            username: userData.username,
            password: hashedPassword,
            firstName: userData.firstName,
            lastName: userData.lastName,
            role: userData.role as any,
            status: UserStatus.ACTIVE as any,
          },
        });

        results.success.push(userData.email);
      } catch (error) {
        results.failed.push({
          email: userData.email,
          reason: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    this.logger.log(
      `Bulk import completed: ${results.success.length} succeeded, ${results.failed.length} failed`,
    );

    return results;
  }
}
