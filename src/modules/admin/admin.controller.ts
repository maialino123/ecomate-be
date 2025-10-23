import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole, RegistrationStatus } from '@common/enums';
import {
  UpdateUserRoleDto,
  UpdateUserStatusDto,
  ManualApproveDto,
  ManualRejectDto,
  BulkImportUserDto,
} from './dto/admin.dto';

@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin')
@Roles(UserRole.OWNER) // All admin endpoints require OWNER role
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // ==================== Registration Requests ====================

  @Get('registration-requests')
  @ApiOperation({ summary: 'Get all registration requests (Owner only)' })
  @ApiQuery({ name: 'status', enum: ['PENDING', 'APPROVED', 'REJECTED', 'EXPIRED'], required: false })
  @ApiQuery({ name: 'email', required: false })
  @ApiResponse({ status: 200, description: 'Registration requests retrieved' })
  async getRegistrationRequests(
    @Query('status') status?: string,
    @Query('email') email?: string,
  ) {
    return this.adminService.getRegistrationRequests(status as RegistrationStatus, email);
  }

  @Get('registration-requests/export')
  @ApiOperation({ summary: 'Export registration requests (Owner only)' })
  @ApiQuery({ name: 'format', enum: ['json', 'csv'], required: false })
  @ApiResponse({ status: 200, description: 'Registration requests exported' })
  async exportRegistrationRequests(@Query('format') format?: 'json' | 'csv') {
    return this.adminService.exportRegistrationRequests(format || 'json');
  }

  @Get('registration-requests/:id')
  @ApiOperation({ summary: 'Get a registration request by ID (Owner only)' })
  @ApiResponse({ status: 200, description: 'Registration request retrieved' })
  @ApiResponse({ status: 404, description: 'Registration request not found' })
  async getRegistrationRequestById(@Param('id') id: string) {
    return this.adminService.getRegistrationRequestById(id);
  }

  @Post('registration-requests/:id/approve')
  @ApiOperation({ summary: 'Manually approve a registration request (Owner only)' })
  @ApiResponse({ status: 200, description: 'User approved and created' })
  @ApiResponse({ status: 404, description: 'Registration request not found' })
  async approveRequest(@Param('id') id: string, @Body() dto: ManualApproveDto) {
    return this.adminService.approveRequest(id, dto.role);
  }

  @Post('registration-requests/:id/reject')
  @ApiOperation({ summary: 'Manually reject a registration request (Owner only)' })
  @ApiResponse({ status: 200, description: 'Registration request rejected' })
  @ApiResponse({ status: 404, description: 'Registration request not found' })
  async rejectRequest(@Param('id') id: string, @Body() dto: ManualRejectDto) {
    return this.adminService.rejectRequest(id, dto.reason);
  }

  @Post('registration-requests/import')
  @ApiOperation({ summary: 'Bulk import users from JSON (Owner only)' })
  @ApiResponse({ status: 200, description: 'Users imported' })
  async bulkImportUsers(@Body() users: BulkImportUserDto[]) {
    return this.adminService.bulkImportUsers(users);
  }

  // ==================== User Management ====================

  @Get('users')
  @ApiOperation({ summary: 'Get all users (Owner only)' })
  @ApiResponse({ status: 200, description: 'Users retrieved' })
  async getUsers() {
    return this.adminService.getUsers();
  }

  @Get('users/:id')
  @ApiOperation({ summary: 'Get a user by ID (Owner only)' })
  @ApiResponse({ status: 200, description: 'User retrieved' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getUserById(@Param('id') id: string) {
    return this.adminService.getUserById(id);
  }

  @Patch('users/:id/role')
  @ApiOperation({ summary: 'Update user role (Owner only)' })
  @ApiResponse({ status: 200, description: 'User role updated' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async updateUserRole(@Param('id') id: string, @Body() dto: UpdateUserRoleDto) {
    return this.adminService.updateUserRole(id, dto.role);
  }

  @Patch('users/:id/status')
  @ApiOperation({ summary: 'Update user status (Owner only)' })
  @ApiResponse({ status: 200, description: 'User status updated' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async updateUserStatus(@Param('id') id: string, @Body() dto: UpdateUserStatusDto) {
    return this.adminService.updateUserStatus(id, dto.status);
  }

  @Delete('users/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a user (Owner only)' })
  @ApiResponse({ status: 200, description: 'User deleted' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async deleteUser(@Param('id') id: string) {
    return this.adminService.deleteUser(id);
  }
}
