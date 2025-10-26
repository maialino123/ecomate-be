import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Product1688Service } from './product1688.service';
import { CreateProduct1688Dto } from './dto/create-product1688.dto';
import { UpdateProduct1688Dto } from './dto/update-product1688.dto';
import { TranslateProduct1688Dto } from './dto/translate-product1688.dto';
import { ApproveProduct1688Dto } from './dto/approve-product1688.dto';
import { RejectProduct1688Dto } from './dto/reject-product1688.dto';
import { QueryProduct1688Dto } from './dto/query-product1688.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@common/enums';

@ApiTags('1688 Products')
@Controller('1688-products')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class Product1688Controller {
  constructor(private readonly product1688Service: Product1688Service) {}

  /**
   * Create Product1688 from extension
   */
  @Post()
  @ApiOperation({ summary: 'Save product from 1688 (extension)' })
  @ApiResponse({ status: 201, description: 'Product saved successfully' })
  @ApiResponse({ status: 409, description: 'Product already exists' })
  async create(@Request() req: any, @Body() createDto: CreateProduct1688Dto) {
    // Let NestJS handle ConflictException automatically (returns 409)
    const product = await this.product1688Service.create(req.user.userId, createDto);
    return product;
  }

  /**
   * Check duplicate
   */
  @Post('check-duplicate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Check if product already exists' })
  @ApiResponse({ status: 200, description: 'Duplicate check result' })
  async checkDuplicate(@Body() body: { originalUrl: string }) {
    const result = await this.product1688Service.checkDuplicate(body.originalUrl);
    return result;
  }

  /**
   * List products (Admin/Owner only)
   */
  @Get()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'List all 1688 products with filters' })
  @ApiResponse({ status: 200, description: 'List of products' })
  async findAll(@Query() query: QueryProduct1688Dto) {
    return this.product1688Service.findAll(query);
  }

  /**
   * Get single product (Admin/Owner only)
   */
  @Get(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Get product details' })
  @ApiResponse({ status: 200, description: 'Product details' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  async findOne(@Param('id') id: string) {
    return this.product1688Service.findOne(id);
  }

  /**
   * Update product (Admin/Owner only)
   */
  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Update product (manual edits)' })
  @ApiResponse({ status: 200, description: 'Product updated' })
  async update(@Param('id') id: string, @Body() updateDto: UpdateProduct1688Dto) {
    return this.product1688Service.update(id, updateDto);
  }

  /**
   * Translate product (Admin/Owner only)
   */
  @Post(':id/translate')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Translate product (name, description, variants)' })
  @ApiResponse({ status: 200, description: 'Product translated' })
  async translate(@Param('id') id: string, @Body() translateDto: TranslateProduct1688Dto) {
    return this.product1688Service.translate(id, translateDto);
  }

  /**
   * Approve and import to Product (Admin/Owner only)
   */
  @Post(':id/approve')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Approve and import to Products' })
  @ApiResponse({ status: 200, description: 'Product approved and imported' })
  @ApiResponse({ status: 400, description: 'Already approved or invalid data' })
  async approve(
    @Request() req: any,
    @Param('id') id: string,
    @Body() approveDto: ApproveProduct1688Dto,
  ) {
    return this.product1688Service.approve(id, req.user.userId, approveDto);
  }

  /**
   * Reject product (Admin/Owner only)
   */
  @Post(':id/reject')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Reject product' })
  @ApiResponse({ status: 200, description: 'Product rejected' })
  async reject(
    @Request() req: any,
    @Param('id') id: string,
    @Body() rejectDto: RejectProduct1688Dto,
  ) {
    return this.product1688Service.reject(id, req.user.userId, rejectDto);
  }

  /**
   * Delete product (Admin/Owner only)
   */
  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Delete product' })
  @ApiResponse({ status: 200, description: 'Product deleted' })
  @ApiResponse({ status: 400, description: 'Cannot delete approved product' })
  async remove(@Param('id') id: string) {
    return this.product1688Service.remove(id);
  }
}
