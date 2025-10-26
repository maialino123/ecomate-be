import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsArray, IsOptional, IsNotEmpty, ArrayMinSize } from 'class-validator';

export class TranslateProductDto {
  @ApiProperty({
    description: 'Product ID to translate',
    example: 'cm123abc456',
  })
  @IsString()
  @IsNotEmpty()
  productId!: string;

  @ApiPropertyOptional({
    description: 'Source language code',
    example: 'zh',
    default: 'zh',
  })
  @IsString()
  @IsOptional()
  sourceLang?: string;

  @ApiPropertyOptional({
    description: 'Target language code',
    example: 'vi',
    default: 'vi',
  })
  @IsString()
  @IsOptional()
  targetLang?: string;

  @ApiPropertyOptional({
    description: 'Force re-translation even if cached',
    example: false,
    default: false,
  })
  @IsOptional()
  forceRefresh?: boolean;
}

export class BatchTranslateDto {
  @ApiProperty({
    description: 'Array of product IDs to translate',
    example: ['cm123abc456', 'cm789def012'],
    type: [String],
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  productIds!: string[];

  @ApiPropertyOptional({
    description: 'Source language code',
    example: 'zh',
    default: 'zh',
  })
  @IsString()
  @IsOptional()
  sourceLang?: string;

  @ApiPropertyOptional({
    description: 'Target language code',
    example: 'vi',
    default: 'vi',
  })
  @IsString()
  @IsOptional()
  targetLang?: string;

  @ApiPropertyOptional({
    description: 'Force re-translation even if cached',
    example: false,
    default: false,
  })
  @IsOptional()
  forceRefresh?: boolean;
}

export class TranslateProductResponseDto {
  @ApiProperty({
    description: 'Product ID',
    example: 'cm123abc456',
  })
  productId!: string;

  @ApiProperty({
    description: 'Product SKU',
    example: 'SKU-1688-001',
  })
  sku!: string;

  @ApiProperty({
    description: 'Translation results',
    example: {
      name: {
        original: '优质产品',
        translated: 'Sản phẩm chất lượng cao',
      },
      description: {
        original: '这是一个高品质的产品',
        translated: 'Đây là một sản phẩm chất lượng cao',
      },
    },
  })
  translations!: {
    name?: {
      original: string;
      translated: string;
    };
    description?: {
      original: string;
      translated: string;
    };
    metadata?: Record<string, any>;
  };

  @ApiProperty({
    description: 'Translation timestamp',
    example: '2025-01-24T10:30:00Z',
  })
  translatedAt!: Date;

  @ApiProperty({
    description: 'Whether result was from cache',
    example: false,
  })
  cached!: boolean;
}

export class BatchTranslateResponseDto {
  @ApiProperty({
    description: 'Total number of products requested',
    example: 10,
  })
  total!: number;

  @ApiProperty({
    description: 'Number of successful translations',
    example: 9,
  })
  successful!: number;

  @ApiProperty({
    description: 'Number of failed translations',
    example: 1,
  })
  failed!: number;

  @ApiProperty({
    description: 'Array of translation results',
    type: [TranslateProductResponseDto],
  })
  results!: TranslateProductResponseDto[];

  @ApiProperty({
    description: 'Array of errors for failed translations',
    example: [{ productId: 'cm123abc', error: 'Product not found' }],
  })
  errors!: Array<{
    productId: string;
    error: string;
  }>;
}

export class TranslationStatsDto {
  @ApiProperty({
    description: 'Number of cache hits',
    example: 150,
  })
  cacheHits!: number;

  @ApiProperty({
    description: 'Number of cache misses',
    example: 50,
  })
  cacheMisses!: number;

  @ApiProperty({
    description: 'Total translation requests',
    example: 200,
  })
  totalRequests!: number;

  @ApiProperty({
    description: 'Cache hit rate percentage',
    example: 75,
  })
  hitRate!: number;
}
