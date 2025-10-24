import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { CostService } from './cost.service';
import {
  CreateCostCalculationDto,
  UpdateCostCalculationDto,
  CostCalculationResponseDto,
  CalculatePriceDto,
  PriceCalculationResultDto,
  QueryCostCalculationDto,
  PaginatedCostCalculationsDto
} from './dto/cost.dto';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { CurrentUser } from '@/modules/auth/decorators/current-user.decorator';

@ApiTags('Cost Calculations')
@Controller('cost')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class CostController {
  constructor(private readonly costService: CostService) {}

  /**
   * Quick price calculation (without saving to database)
   * POST /cost/calculate
   */
  @Post('calculate')
  @ApiOperation({
    summary: 'Calculate price without saving',
    description: 'Quick calculation of product pricing based on the cost formula. Does not save to database.'
  })
  @ApiResponse({
    status: 200,
    description: 'Price calculation successful',
    type: PriceCalculationResultDto
  })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  async calculatePrice(
    @Body() dto: CalculatePriceDto
  ): Promise<PriceCalculationResultDto> {
    return this.costService.calculatePrice(dto);
  }

  /**
   * Create and save cost calculation
   * POST /cost/calculations
   */
  @Post('calculations')
  @ApiOperation({
    summary: 'Create cost calculation',
    description: 'Create and save a cost calculation for a product'
  })
  @ApiResponse({
    status: 201,
    description: 'Cost calculation created successfully',
    type: CostCalculationResponseDto
  })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  async createCostCalculation(
    @CurrentUser() user: { id: string },
    @Body() dto: CreateCostCalculationDto
  ): Promise<CostCalculationResponseDto> {
    return this.costService.createCostCalculation(user.id, dto);
  }

  /**
   * Get cost calculation by ID
   * GET /cost/calculations/:id
   */
  @Get('calculations/:id')
  @ApiOperation({
    summary: 'Get cost calculation by ID',
    description: 'Retrieve a specific cost calculation by its ID'
  })
  @ApiResponse({
    status: 200,
    description: 'Cost calculation retrieved successfully',
    type: CostCalculationResponseDto
  })
  @ApiResponse({ status: 404, description: 'Cost calculation not found' })
  async getCostCalculation(
    @Param('id') id: string
  ): Promise<CostCalculationResponseDto> {
    return this.costService.getCostCalculation(id);
  }

  /**
   * Get all cost calculations for a product
   * GET /cost/calculations/product/:productId
   */
  @Get('calculations/product/:productId')
  @ApiOperation({
    summary: 'Get cost calculations by product',
    description: 'Retrieve all cost calculations for a specific product with pagination'
  })
  @ApiResponse({
    status: 200,
    description: 'Cost calculations retrieved successfully',
    type: PaginatedCostCalculationsDto
  })
  async getCostCalculationsByProduct(
    @Param('productId') productId: string,
    @Query() query: QueryCostCalculationDto
  ): Promise<PaginatedCostCalculationsDto> {
    return this.costService.getCostCalculationsByProduct(productId, query);
  }

  /**
   * Get latest cost calculation for a product
   * GET /cost/calculations/product/:productId/latest
   */
  @Get('calculations/product/:productId/latest')
  @ApiOperation({
    summary: 'Get latest cost calculation',
    description: 'Retrieve the most recent cost calculation for a product'
  })
  @ApiResponse({
    status: 200,
    description: 'Latest cost calculation retrieved successfully',
    type: CostCalculationResponseDto
  })
  @ApiResponse({ status: 404, description: 'No cost calculation found for this product' })
  async getLatestCostCalculation(
    @Param('productId') productId: string
  ): Promise<CostCalculationResponseDto | null> {
    return this.costService.getLatestCostCalculation(productId);
  }

  /**
   * Update cost calculation
   * PATCH /cost/calculations/:id
   */
  @Patch('calculations/:id')
  @ApiOperation({
    summary: 'Update cost calculation',
    description: 'Update an existing cost calculation. Automatically recalculates all derived values.'
  })
  @ApiResponse({
    status: 200,
    description: 'Cost calculation updated successfully',
    type: CostCalculationResponseDto
  })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 404, description: 'Cost calculation not found' })
  async updateCostCalculation(
    @Param('id') id: string,
    @CurrentUser() user: { id: string },
    @Body() dto: UpdateCostCalculationDto
  ): Promise<CostCalculationResponseDto> {
    return this.costService.updateCostCalculation(id, user.id, dto);
  }

  /**
   * Delete cost calculation
   * DELETE /cost/calculations/:id
   */
  @Delete('calculations/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete cost calculation',
    description: 'Delete a cost calculation by ID'
  })
  @ApiResponse({ status: 204, description: 'Cost calculation deleted successfully' })
  @ApiResponse({ status: 404, description: 'Cost calculation not found' })
  async deleteCostCalculation(
    @Param('id') id: string,
    @CurrentUser() user: { id: string }
  ): Promise<void> {
    return this.costService.deleteCostCalculation(id, user.id);
  }
}
