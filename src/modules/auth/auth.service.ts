import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '@db/prisma.service';
import { EnvService } from '@env/env.service';
import { EmailService } from '@utils/email/email.service';
import {
  SignUpDto,
  SignInDto,
  RefreshTokenDto,
  AuthResponseDto,
  RegisterDto,
  RegisterResponseDto,
  MagicLinkResponseDto,
  ApprovalResponseDto,
} from './dto/auth.dto';
import { User } from '@prisma/client';
import { UserRole, UserStatus, RegistrationStatus, ActionType } from '@common/enums';
import { randomBytes } from 'crypto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private envService: EnvService,
    private emailService: EmailService,
  ) {}

  async signUp(dto: SignUpDto): Promise<AuthResponseDto> {
    // Check if user exists
    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: [
          { email: dto.email },
          { username: dto.username },
        ],
      },
    });

    if (existingUser) {
      throw new ConflictException('User with this email or username already exists');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(dto.password, 10);

    // Create user
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password: hashedPassword,
        username: dto.username,
        firstName: dto.firstName,
        lastName: dto.lastName,
      },
    });

    // Generate tokens
    const tokens = await this.generateTokens(user);

    // Save refresh token
    await this.saveRefreshToken(user.id, tokens.refreshToken);

    this.logger.log(`User registered: ${user.email}`);

    return {
      ...tokens,
      user: this.sanitizeUser(user),
    };
  }

  /**
   * NEW IAM: Register new user - creates pending request and sends approval email to owner
   */
  async register(dto: RegisterDto): Promise<RegisterResponseDto> {
    // Check if user already exists
    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: dto.email }, dto.username ? { username: dto.username } : {}],
      },
    });

    if (existingUser) {
      throw new ConflictException('User with this email or username already exists');
    }

    // Check if there's already a pending request
    const existingRequest = await this.prisma.userRegistrationRequest.findFirst({
      where: {
        email: dto.email,
        status: RegistrationStatus.PENDING as any,
      },
    });

    if (existingRequest) {
      throw new ConflictException(
        'A registration request for this email is already pending approval',
      );
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(dto.password, 10);

    // Create approval token (expires in 3 days)
    const approvalToken = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000); // 3 days

    // Create action token
    const actionToken = await this.prisma.actionToken.create({
      data: {
        token: approvalToken,
        type: ActionType.APPROVAL as any,
        expiresAt,
        metadata: {
          email: dto.email,
          username: dto.username,
          firstName: dto.firstName,
          lastName: dto.lastName,
        },
      },
    });

    // Create registration request
    await this.prisma.userRegistrationRequest.create({
      data: {
        email: dto.email,
        username: dto.username,
        password: hashedPassword,
        firstName: dto.firstName,
        lastName: dto.lastName,
        actionTokenId: actionToken.id,
        expiresAt,
      },
    });

    // Send approval email to owner
    const ownerEmail = this.envService.get('OWNER_EMAIL');
    const userName = [dto.firstName, dto.lastName].filter(Boolean).join(' ') || dto.email;

    await this.emailService.sendApprovalRequest({
      ownerEmail,
      userEmail: dto.email,
      userName,
      approvalToken,
    });

    this.logger.log(`Registration request created for ${dto.email}, approval email sent to owner`);

    return {
      message: 'Registration submitted successfully. Please wait for owner approval.',
      email: dto.email,
    };
  }

  /**
   * NEW IAM: Sign in with 2FA for Owner, normal JWT for other users
   */
  async signIn(
    dto: SignInDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<AuthResponseDto | MagicLinkResponseDto> {
    // Find user
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Invalid credentials or account is not active');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(dto.password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check if user requires 2FA (Owner)
    if (user.require2FA) {
      // Check if there's an existing valid magic link token
      const existingToken = await this.prisma.actionToken.findFirst({
        where: {
          userId: user.id,
          type: ActionType.MAGIC_LINK as any,
          usedAt: null,
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: 'desc' },
      });

      let magicToken: string;

      if (existingToken) {
        // Reuse existing valid token
        magicToken = existingToken.token;
        this.logger.log(`Reusing existing magic link token for ${user.email}`);
      } else {
        // Generate new magic link token (expires in 5 minutes)
        magicToken = randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

        await this.prisma.actionToken.create({
          data: {
            token: magicToken,
            type: ActionType.MAGIC_LINK as any,
            userId: user.id,
            expiresAt,
            metadata: { ipAddress, userAgent },
          },
        });

        this.logger.log(`Generated new magic link token for ${user.email}`);
      }

      // Send magic link email
      await this.emailService.sendMagicLink({
        email: user.email,
        token: magicToken,
        ipAddress,
        userAgent,
      });

      return {
        message: 'Please check your email to complete login',
        require2FA: true,
      };
    }

    // Normal users - generate JWT tokens
    const tokens = await this.generateTokens(user);

    // Save refresh token
    await this.saveRefreshToken(user.id, tokens.refreshToken);

    this.logger.log(`User signed in: ${user.email}`);

    return {
      ...tokens,
      user: this.sanitizeUser(user),
    };
  }

  async signOut(userId: string): Promise<void> {
    // Delete all refresh tokens for the user
    await this.prisma.refreshToken.deleteMany({
      where: { userId },
    });

    this.logger.log(`User signed out: ${userId}`);
  }

  async refreshTokens(dto: RefreshTokenDto): Promise<AuthResponseDto> {
    // Find refresh token
    const refreshToken = await this.prisma.refreshToken.findUnique({
      where: { token: dto.refreshToken },
      include: { user: true },
    });

    if (!refreshToken || refreshToken.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Generate new tokens
    const tokens = await this.generateTokens(refreshToken.user);

    // Delete old refresh token and save new one
    await this.prisma.$transaction([
      this.prisma.refreshToken.delete({
        where: { id: refreshToken.id },
      }),
      this.prisma.refreshToken.create({
        data: {
          token: tokens.refreshToken,
          userId: refreshToken.userId,
          expiresAt: new Date(Date.now() + this.getRefreshTokenTTL()),
        },
      }),
    ]);

    return {
      ...tokens,
      user: this.sanitizeUser(refreshToken.user),
    };
  }

  async validateUser(userId: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { id: userId, status: UserStatus.ACTIVE as any },
    });
  }

  /**
   * NEW IAM: Verify magic link and return JWT tokens
   */
  async verifyMagicLink(token: string): Promise<AuthResponseDto> {
    // Find and validate token
    const actionToken = await this.prisma.actionToken.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!actionToken || actionToken.type !== 'MAGIC_LINK') {
      throw new UnauthorizedException('Invalid or expired magic link');
    }

    if (actionToken.usedAt) {
      throw new UnauthorizedException('This magic link has already been used');
    }

    if (actionToken.expiresAt < new Date()) {
      throw new UnauthorizedException('This magic link has expired');
    }

    if (!actionToken.user) {
      throw new UnauthorizedException('User not found');
    }

    // Mark token as used
    await this.prisma.actionToken.update({
      where: { id: actionToken.id },
      data: { usedAt: new Date() },
    });

    // Generate JWT tokens
    const tokens = await this.generateTokens(actionToken.user);

    // Save refresh token
    await this.saveRefreshToken(actionToken.user.id, tokens.refreshToken);

    this.logger.log(`User verified via magic link: ${actionToken.user.email}`);

    return {
      ...tokens,
      user: this.sanitizeUser(actionToken.user),
    };
  }

  /**
   * NEW IAM: Approve registration request and create user
   */
  async approveRegistration(token: string, role?: UserRole): Promise<ApprovalResponseDto> {
    // Find and validate approval token
    const actionToken = await this.prisma.actionToken.findUnique({
      where: { token },
    });

    if (!actionToken || actionToken.type !== 'APPROVAL') {
      throw new BadRequestException('Invalid approval token');
    }

    if (actionToken.usedAt) {
      throw new BadRequestException('This approval link has already been used');
    }

    if (actionToken.expiresAt < new Date()) {
      throw new BadRequestException('This approval link has expired');
    }

    // Find registration request
    const request = await this.prisma.userRegistrationRequest.findFirst({
      where: {
        actionTokenId: actionToken.id,
        status: RegistrationStatus.PENDING as any,
      },
    });

    if (!request) {
      throw new NotFoundException('Registration request not found or already processed');
    }

    // Determine role (default to VIEWER if not specified)
    const assignedRole = role || UserRole.VIEWER;

    // Validate role (cannot assign OWNER role)
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

    // Mark token as used and delete registration request
    await this.prisma.$transaction([
      this.prisma.actionToken.update({
        where: { id: actionToken.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.userRegistrationRequest.delete({
        where: { id: request.id },
      }),
    ]);

    this.logger.log(`User ${user.email} approved with role ${assignedRole}`);

    return {
      message: `User ${user.email} has been approved successfully`,
      userEmail: user.email,
      role: assignedRole,
    };
  }

  /**
   * NEW IAM: Reject registration request
   */
  async rejectRegistration(token: string, reason?: string): Promise<ApprovalResponseDto> {
    // Find and validate approval token
    const actionToken = await this.prisma.actionToken.findUnique({
      where: { token },
    });

    if (!actionToken || actionToken.type !== 'APPROVAL') {
      throw new BadRequestException('Invalid approval token');
    }

    if (actionToken.usedAt) {
      throw new BadRequestException('This approval link has already been used');
    }

    if (actionToken.expiresAt < new Date()) {
      throw new BadRequestException('This approval link has expired');
    }

    // Find registration request
    const request = await this.prisma.userRegistrationRequest.findFirst({
      where: {
        actionTokenId: actionToken.id,
        status: RegistrationStatus.PENDING as any,
      },
    });

    if (!request) {
      throw new NotFoundException('Registration request not found or already processed');
    }

    // Mark token as used and update request status to REJECTED
    await this.prisma.$transaction([
      this.prisma.actionToken.update({
        where: { id: actionToken.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.userRegistrationRequest.update({
        where: { id: request.id },
        data: {
          status: RegistrationStatus.REJECTED as any,
          rejectedAt: new Date(),
          rejectionReason: reason,
        },
      }),
    ]);

    this.logger.log(`Registration request for ${request.email} has been rejected`);

    return {
      message: `Registration request for ${request.email} has been rejected`,
      userEmail: request.email,
    };
  }

  private async generateTokens(user: User) {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const jwtConfig = this.envService.getJwtConfig();

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: jwtConfig.secret,
        expiresIn: jwtConfig.expiresIn,
      } as any),
      this.jwtService.signAsync(payload, {
        secret: jwtConfig.refreshSecret,
        expiresIn: jwtConfig.refreshExpiresIn,
      } as any),
    ]);

    return { accessToken, refreshToken };
  }

  private async saveRefreshToken(userId: string, token: string): Promise<void> {
    const expiresAt = new Date(Date.now() + this.getRefreshTokenTTL());

    await this.prisma.refreshToken.create({
      data: {
        token,
        userId,
        expiresAt,
      },
    });
  }

  private getRefreshTokenTTL(): number {
    // Convert refresh token expiry to milliseconds
    const expiresIn = this.envService.getJwtConfig().refreshExpiresIn;
    const match = expiresIn.match(/^(\d+)([dhms])$/);
    if (!match) return 30 * 24 * 60 * 60 * 1000; // Default 30 days

    const value = parseInt(match[1]);
    const unit = match[2];

    switch (unit) {
      case 'd': return value * 24 * 60 * 60 * 1000;
      case 'h': return value * 60 * 60 * 1000;
      case 'm': return value * 60 * 1000;
      case 's': return value * 1000;
      default: return 30 * 24 * 60 * 60 * 1000;
    }
  }

  private sanitizeUser(user: User) {
    return {
      id: user.id,
      email: user.email,
      username: user.username ?? undefined,
      firstName: user.firstName ?? undefined,
      lastName: user.lastName ?? undefined,
      role: user.role.toString(),
    };
  }
}