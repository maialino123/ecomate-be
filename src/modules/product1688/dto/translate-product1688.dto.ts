import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class TranslateProduct1688Dto {
  @ApiPropertyOptional({
    description: 'Translate product name',
    example: true,
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  translateName?: boolean;

  @ApiPropertyOptional({
    description: 'Translate product description',
    example: true,
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  translateDescription?: boolean;

  @ApiPropertyOptional({
    description: 'Translate all variants/SKUs',
    example: true,
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  translateVariants?: boolean;

  @ApiPropertyOptional({
    description: 'Force refresh translation (bypass cache)',
    example: false,
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  forceRefresh?: boolean;
}
