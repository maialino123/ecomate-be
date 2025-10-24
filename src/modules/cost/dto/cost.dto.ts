import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, IsUUID, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTO for creating a cost calculation
 * Based on the formula: P = ([(P_nhập + P_shipTQ) × T_CNY→VND + P_shipVN + P_xử_lý] / SL(1-R)) × (1+G) / (1-F)
 */
export class CreateCostCalculationDto {
  @ApiProperty({
    example: 'cm123abc456',
    description: 'Product ID to calculate cost for'
  })
  @IsUUID()
  productId!: string;

  // Input costs (Chi phí đầu vào)
  @ApiProperty({
    example: 5.2,
    description: 'Import price from factory/1688 (CNY) - P_nhập'
  })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  importPrice!: number;

  @ApiPropertyOptional({
    example: 10,
    description: 'Domestic shipping cost in China (CNY) - P_shipTQ',
    default: 0
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  domesticShippingCN?: number;

  @ApiPropertyOptional({
    example: 75000,
    description: 'International shipping cost to Vietnam (VND) - P_shipVN',
    default: 0
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  internationalShippingVN?: number;

  @ApiPropertyOptional({
    example: 50000,
    description: 'Handling/customs/warehouse fee (VND) - P_xử_lý',
    default: 0
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  handlingFee?: number;

  // Exchange rate and quantity
  @ApiProperty({
    example: 3600,
    description: 'CNY to VND exchange rate - T_CNY→VND'
  })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  exchangeRateCNY!: number;

  @ApiProperty({
    example: 50,
    description: 'Quantity of products in the batch - SL',
    default: 1
  })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  quantity!: number;

  // Business parameters (Tham số kinh doanh)
  @ApiPropertyOptional({
    example: 0.05,
    description: 'Return rate (0.05 = 5%) - R',
    default: 0
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  returnRate?: number;

  @ApiPropertyOptional({
    example: 0.20,
    description: 'Platform fee rate (0.20 = 20%) - F',
    default: 0
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  platformFeeRate?: number;

  @ApiPropertyOptional({
    example: 0.15,
    description: 'Desired profit margin rate (0.15 = 15%) - G',
    default: 0
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  profitMarginRate?: number;

  @ApiPropertyOptional({
    example: 'VND',
    description: 'Currency for the result',
    default: 'VND'
  })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({
    example: 'Cost calculation for Q4 2024 batch',
    description: 'Additional notes'
  })
  @IsOptional()
  @IsString()
  notes?: string;
}

/**
 * DTO for updating a cost calculation
 */
export class UpdateCostCalculationDto extends PartialType(CreateCostCalculationDto) {}

/**
 * DTO for quick price calculation (without saving to DB)
 */
export class CalculatePriceDto {
  // Input costs (Chi phí đầu vào)
  @ApiProperty({
    example: 5.2,
    description: 'Import price from factory/1688 (CNY) - P_nhập'
  })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  importPrice!: number;

  @ApiPropertyOptional({
    example: 10,
    description: 'Domestic shipping cost in China (CNY) - P_shipTQ',
    default: 0
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  domesticShippingCN?: number;

  @ApiPropertyOptional({
    example: 75000,
    description: 'International shipping cost to Vietnam (VND) - P_shipVN',
    default: 0
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  internationalShippingVN?: number;

  @ApiPropertyOptional({
    example: 50000,
    description: 'Handling/customs/warehouse fee (VND) - P_xử_lý',
    default: 0
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  handlingFee?: number;

  // Exchange rate and quantity
  @ApiProperty({
    example: 3600,
    description: 'CNY to VND exchange rate - T_CNY→VND'
  })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  exchangeRateCNY!: number;

  @ApiProperty({
    example: 50,
    description: 'Quantity of products in the batch - SL',
    default: 1
  })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  quantity!: number;

  // Business parameters (Tham số kinh doanh)
  @ApiPropertyOptional({
    example: 0.05,
    description: 'Return rate (0.05 = 5%) - R',
    default: 0
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  returnRate?: number;

  @ApiPropertyOptional({
    example: 0.20,
    description: 'Platform fee rate (0.20 = 20%) - F',
    default: 0
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  platformFeeRate?: number;

  @ApiPropertyOptional({
    example: 0.15,
    description: 'Desired profit margin rate (0.15 = 15%) - G',
    default: 0
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  profitMarginRate?: number;
}

/**
 * Response DTO for cost calculation results
 */
export class CostCalculationResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  productId!: string;

  @ApiProperty()
  userId!: string;

  // Input costs
  @ApiProperty({ description: 'Import price (CNY)' })
  importPrice!: number;

  @ApiProperty({ description: 'Domestic shipping in China (CNY)' })
  domesticShippingCN!: number;

  @ApiProperty({ description: 'International shipping to Vietnam (VND)' })
  internationalShippingVN!: number;

  @ApiProperty({ description: 'Handling fee (VND)' })
  handlingFee!: number;

  // Exchange rate and quantity
  @ApiProperty({ description: 'CNY to VND exchange rate' })
  exchangeRateCNY!: number;

  @ApiProperty({ description: 'Quantity in batch' })
  quantity!: number;

  // Business parameters
  @ApiProperty({ description: 'Return rate (decimal)' })
  returnRate!: number;

  @ApiProperty({ description: 'Platform fee rate (decimal)' })
  platformFeeRate!: number;

  @ApiProperty({ description: 'Profit margin rate (decimal)' })
  profitMarginRate!: number;

  // Calculated results
  @ApiProperty({ description: 'Base cost per product (VND) - C₀' })
  baseCost!: number;

  @ApiProperty({ description: 'Effective cost with return rate (VND) - C_eff' })
  effectiveCost!: number;

  @ApiProperty({ description: 'Suggested selling price (VND) - P' })
  suggestedSellingPrice!: number;

  @ApiProperty({ description: 'Net profit per product (VND) - L' })
  netProfit!: number;

  @ApiProperty({ description: 'Break-even price (VND) - P_BE' })
  breakEvenPrice!: number;

  @ApiProperty()
  currency!: string;

  @ApiPropertyOptional()
  notes?: string;

  @ApiPropertyOptional({
    description: 'Full calculation breakdown',
    type: 'object',
    additionalProperties: true
  })
  calculationData?: Record<string, any>;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

/**
 * Response DTO for quick price calculation (without DB fields)
 */
export class PriceCalculationResultDto {
  // Calculated results
  @ApiProperty({ description: 'Base cost per product (VND) - C₀' })
  baseCost!: number;

  @ApiProperty({ description: 'Effective cost with return rate (VND) - C_eff' })
  effectiveCost!: number;

  @ApiProperty({ description: 'Suggested selling price (VND) - P' })
  suggestedSellingPrice!: number;

  @ApiProperty({ description: 'Net profit per product (VND) - L' })
  netProfit!: number;

  @ApiProperty({ description: 'Break-even price (VND) - P_BE' })
  breakEvenPrice!: number;

  @ApiProperty({
    description: 'Full calculation breakdown',
    type: 'object',
    additionalProperties: true
  })
  calculationBreakdown!: {
    // Input values
    inputs: {
      importPriceCNY: number;
      domesticShippingCNY: number;
      internationalShippingVND: number;
      handlingFeeVND: number;
      exchangeRateCNY: number;
      quantity: number;
      returnRate: number;
      platformFeeRate: number;
      profitMarginRate: number;
    };
    // Step by step calculation
    steps: {
      totalCNYCost: number;          // (P_nhập + P_shipTQ)
      totalCNYInVND: number;         // (P_nhập + P_shipTQ) × T_CNY→VND
      totalVNDCost: number;          // Total in VND before division
      baseCostPerUnit: number;       // C₀
      effectiveCostPerUnit: number;  // C_eff
      priceBeforePlatformFee: number; // P × (1-F)
      suggestedPrice: number;        // P
      netProfitPerUnit: number;      // L
      breakEvenPrice: number;        // P_BE
    };
    // Percentages for UI
    percentages: {
      profitMarginPercentage: number;     // (L / C_eff) × 100
      platformFeePercentage: number;      // F × 100
      returnRatePercentage: number;       // R × 100
    };
  };
}

/**
 * Query DTO for listing cost calculations
 */
export class QueryCostCalculationDto {
  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 10, default: 10 })
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  limit?: number = 10;

  @ApiPropertyOptional({ example: 'cm123abc456' })
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiPropertyOptional({ example: 'createdAt', enum: ['createdAt', 'updatedAt', 'suggestedSellingPrice'] })
  @IsOptional()
  @IsString()
  sortBy?: string = 'createdAt';

  @ApiPropertyOptional({ example: 'desc', enum: ['asc', 'desc'] })
  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc' = 'desc';
}

/**
 * Paginated response for cost calculations
 */
export class PaginatedCostCalculationsDto {
  @ApiProperty({ type: [CostCalculationResponseDto] })
  data!: CostCalculationResponseDto[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty()
  totalPages!: number;
}
