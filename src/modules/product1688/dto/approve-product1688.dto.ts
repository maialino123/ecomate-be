import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsBoolean } from 'class-validator';

export class ApproveProduct1688Dto {
  @ApiProperty({
    description: 'SKU for the product (manual input, must be unique)',
    example: 'SKU-1688-001',
  })
  @IsString()
  @IsNotEmpty()
  sku!: string;

  @ApiProperty({
    description: 'Category ID (select from existing categories)',
    example: 'cm123abc456',
  })
  @IsString()
  @IsNotEmpty()
  categoryId!: string;

  @ApiPropertyOptional({
    description: 'Supplier ID (link to existing supplier)',
    example: 'cm789def012',
  })
  @IsString()
  @IsOptional()
  supplierId?: string;

  @ApiPropertyOptional({
    description: 'Create new supplier from 1688 data',
    example: false,
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  createSupplier?: boolean;
}
