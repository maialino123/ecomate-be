import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsArray } from 'class-validator';

export class UpdateProduct1688Dto {
  @ApiPropertyOptional({
    description: 'Vietnamese name (manually edited)',
    example: 'Áo thun cotton chất lượng cao',
  })
  @IsString()
  @IsOptional()
  nameVi?: string;

  @ApiPropertyOptional({
    description: 'Vietnamese description (manually edited)',
    example: '100% cotton thuần, thoáng mát',
  })
  @IsString()
  @IsOptional()
  descriptionVi?: string;

  @ApiPropertyOptional({
    description: 'Updated variants (JSON)',
    example: [
      {
        sku: 'V123',
        nameZh: '红色-L码',
        nameVi: 'Đỏ - Size L',
        attributes: { color: 'Đỏ', size: 'L' },
        price: 12.5,
        stock: 999,
      },
    ],
  })
  @IsOptional()
  variants?: any;

  @ApiPropertyOptional({
    description: 'Cost calculation (JSON)',
    example: {
      importPrice: 10.5,
      exchangeRateCNY: 3600,
      finalPriceVND: 50000,
    },
  })
  @IsOptional()
  costCalculation?: any;

  @ApiPropertyOptional({
    description: 'Selected images by staff',
    example: [
      'https://cbu01.alicdn.com/img/ibank/123.jpg',
      'https://cbu01.alicdn.com/img/ibank/456.jpg',
    ],
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  selectedImages?: string[];
}
