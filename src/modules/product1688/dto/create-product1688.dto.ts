import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsNumber, IsOptional, IsArray, IsUrl, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateProduct1688Dto {
  @ApiProperty({
    description: 'Product name in Chinese',
    example: '优质棉T恤',
  })
  @IsString()
  @IsNotEmpty()
  nameZh!: string;

  @ApiPropertyOptional({
    description: 'Product description in Chinese',
    example: '100%纯棉，舒适透气',
  })
  @IsString()
  @IsOptional()
  descriptionZh?: string;

  @ApiProperty({
    description: '1688 product URL',
    example: 'https://detail.1688.com/offer/123456789.html',
  })
  @IsString()
  @IsNotEmpty()
  @IsUrl()
  originalUrl!: string;

  @ApiProperty({
    description: 'Minimum price in CNY',
    example: 10.5,
  })
  @IsNumber()
  @Min(0)
  priceMinCNY!: number;

  @ApiPropertyOptional({
    description: 'Maximum price in CNY (if range)',
    example: 25.0,
  })
  @IsNumber()
  @Min(0)
  @IsOptional()
  priceMaxCNY?: number;

  @ApiProperty({
    description: 'Array of image URLs',
    example: ['https://...image1.jpg', 'https://...image2.jpg'],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  images!: string[];

  @ApiPropertyOptional({
    description: 'Main thumbnail image URL',
    example: 'https://...thumbnail.jpg',
  })
  @IsString()
  @IsOptional()
  thumbnail?: string;

  @ApiPropertyOptional({
    description: 'Product variants (JSON)',
    example: [
      {
        sku: 'V123',
        nameZh: '红色-L码',
        attributes: { color: '红色', size: 'L' },
        price: 12.5,
        stock: 999,
      },
    ],
  })
  @IsOptional()
  variants?: any;

  @ApiPropertyOptional({
    description: 'Supplier name from 1688',
    example: '杭州优质供应商',
  })
  @IsString()
  @IsOptional()
  supplierName?: string;

  @ApiPropertyOptional({
    description: '1688 supplier ID',
    example: 'b2b-123456789',
  })
  @IsString()
  @IsOptional()
  supplierId1688?: string;

  @ApiPropertyOptional({
    description: '1688 original video URL (for video dubbing)',
    example: 'https://cloud.video.taobao.com/play/u/xxx/p/1/e/6/t/1/xxx.mp4',
  })
  @IsString()
  @IsOptional()
  @IsUrl()
  originalVideoUrl?: string;
}
