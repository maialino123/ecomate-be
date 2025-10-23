import {
  Controller,
  Post,
  Body,
  UseGuards,
  Get,
  Query,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AuthService } from './auth.service';
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
import { Public } from './decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { UserRole } from '@common/enums';
import { FastifyRequest } from 'fastify';

@ApiTags('auth')
@Controller('v1/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('signup')
  @ApiOperation({ summary: 'Register a new user' })
  @ApiResponse({ status: 201, description: 'User registered successfully', type: AuthResponseDto })
  @ApiResponse({ status: 409, description: 'User already exists' })
  async signUp(@Body() dto: SignUpDto): Promise<AuthResponseDto> {
    return this.authService.signUp(dto);
  }

  @Public()
  @Post('signin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign in with email and password (2FA for Owner)' })
  @ApiResponse({ status: 200, description: 'User signed in successfully or magic link sent', type: AuthResponseDto })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async signIn(
    @Body() dto: SignInDto,
    @Req() req: FastifyRequest,
  ): Promise<AuthResponseDto | MagicLinkResponseDto> {
    const ipAddress = req.ip;
    const userAgent = req.headers['user-agent'];
    const origin = req.headers.origin;
    return this.authService.signIn(dto, ipAddress, userAgent, origin);
  }

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Register new user (requires owner approval)' })
  @ApiResponse({ status: 201, description: 'Registration request submitted', type: RegisterResponseDto })
  @ApiResponse({ status: 409, description: 'User already exists or request pending' })
  async register(
    @Body() dto: RegisterDto,
    @Req() req: FastifyRequest,
  ): Promise<RegisterResponseDto> {
    const origin = req.headers.origin;
    return this.authService.register(dto, origin);
  }

  @Public()
  @Get('verify-login')
  @ApiOperation({ summary: 'Verify magic link for 2FA login' })
  @ApiQuery({ name: 'token', required: true })
  @ApiResponse({ status: 200, description: 'Magic link verified, JWT tokens returned', type: AuthResponseDto })
  @ApiResponse({ status: 401, description: 'Invalid or expired magic link' })
  async verifyMagicLink(@Query('token') token: string): Promise<AuthResponseDto> {
    return this.authService.verifyMagicLink(token);
  }

  @Public()
  @Get('approval/accept')
  @ApiOperation({ summary: 'Approve user registration request' })
  @ApiQuery({ name: 'token', required: true })
  @ApiQuery({ name: 'role', required: false, enum: ['ADMIN', 'STAFF', 'VIEWER'] })
  @ApiResponse({ status: 200, description: 'User approved successfully', type: ApprovalResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid or expired approval token' })
  async approveRegistration(
    @Query('token') token: string,
    @Query('role') role?: string,
  ): Promise<ApprovalResponseDto> {
    const userRole = role as UserRole | undefined;
    return this.authService.approveRegistration(token, userRole);
  }

  @Public()
  @Get('approval/reject')
  @ApiOperation({ summary: 'Reject user registration request' })
  @ApiQuery({ name: 'token', required: true })
  @ApiQuery({ name: 'reason', required: false })
  @ApiResponse({ status: 200, description: 'User registration rejected', type: ApprovalResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid or expired approval token' })
  async rejectRegistration(
    @Query('token') token: string,
    @Query('reason') reason?: string,
  ): Promise<ApprovalResponseDto> {
    return this.authService.rejectRegistration(token, reason);
  }

  @UseGuards(JwtAuthGuard)
  @Post('signout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Sign out and invalidate refresh tokens' })
  @ApiResponse({ status: 200, description: 'User signed out successfully' })
  async signOut(@CurrentUser() user: CurrentUser): Promise<{ message: string }> {
    await this.authService.signOut(user.id);
    return { message: 'Signed out successfully' };
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token' })
  @ApiResponse({ status: 200, description: 'Tokens refreshed successfully', type: AuthResponseDto })
  @ApiResponse({ status: 401, description: 'Invalid refresh token' })
  async refresh(@Body() dto: RefreshTokenDto): Promise<AuthResponseDto> {
    return this.authService.refreshTokens(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user info' })
  @ApiResponse({ status: 200, description: 'Current user info' })
  async getMe(@CurrentUser() user: CurrentUser): Promise<CurrentUser> {
    return user;
  }
}