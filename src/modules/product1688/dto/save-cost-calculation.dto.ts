import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsNumber, IsOptional, Min, Max } from 'class-validator';

/**
 * DTO for saving variant cost calculation
 * Used when calculating cost for a specific Product1688 variant
 */
export class SaveCostCalculationDto {
  @ApiProperty({
    description: 'Product1688 ID',
    example: 'clxxx123456789',
  })
  @IsString()
  @IsNotEmpty()
  product1688Id!: string;

  @ApiProperty({
    description: 'Variant SKU',
    example: 'SKU-001',
  })
  @IsString()
  @IsNotEmpty()
  variantSku!: string;

  // ============================================================================
  // Input costs (Chi phí đầu vào)
  // ============================================================================

  @ApiProperty({
    description: 'Import price from 1688 (CNY)',
    example: 25.5,
  })
  @IsNumber()
  @Min(0)
  importPrice!: number;

  @ApiPropertyOptional({
    description: 'Domestic shipping within China (CNY)',
    example: 5.0,
    default: 0,
  })
  @IsNumber()
  @Min(0)
  @IsOptional()
  domesticShippingCN?: number;

  @ApiPropertyOptional({
    description: 'International shipping to Vietnam (VND)',
    example: 50000,
    default: 0,
  })
  @IsNumber()
  @Min(0)
  @IsOptional()
  internationalShippingVN?: number;

  @ApiPropertyOptional({
    description: 'Handling/processing/customs fee (VND)',
    example: 20000,
    default: 0,
  })
  @IsNumber()
  @Min(0)
  @IsOptional()
  handlingFee?: number;

  // ============================================================================
  // Exchange rate and quantity
  // ============================================================================

  @ApiProperty({
    description: 'Exchange rate CNY to VND',
    example: 3600,
  })
  @IsNumber()
  @Min(0)
  exchangeRateCNY!: number;

  @ApiPropertyOptional({
    description: 'Quantity in order batch',
    example: 10,
    default: 1,
  })
  @IsNumber()
  @Min(1)
  @IsOptional()
  quantity?: number;

  // ============================================================================
  // Business parameters (Tham số kinh doanh)
  // ============================================================================

  @ApiPropertyOptional({
    description: 'Return/refund rate (0-1, e.g., 0.05 = 5%)',
    example: 0.05,
    default: 0,
  })
  @IsNumber()
  @Min(0)
  @Max(1)
  @IsOptional()
  returnRate?: number;

  @ApiPropertyOptional({
    description: 'Platform fee rate (0-1, e.g., 0.20 = 20%)',
    example: 0.20,
    default: 0,
  })
  @IsNumber()
  @Min(0)
  @Max(1)
  @IsOptional()
  platformFeeRate?: number;

  @ApiPropertyOptional({
    description: 'Desired profit margin rate (0-1, e.g., 0.15 = 15%)',
    example: 0.15,
    default: 0,
  })
  @IsNumber()
  @Min(0)
  @Max(1)
  @IsOptional()
  profitMarginRate?: number;

  // ============================================================================
  // Optional metadata
  // ============================================================================

  @ApiPropertyOptional({
    description: 'Additional notes for this calculation',
    example: 'Bulk order calculation for winter collection',
  })
  @IsString()
  @IsOptional()
  notes?: string;
}
