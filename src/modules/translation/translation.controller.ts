import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  HttpCode,
  HttpStatus,
  Param,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { TranslationService } from './translation.service';
import {
  TranslateProductDto,
  BatchTranslateDto,
  TranslateProductResponseDto,
  BatchTranslateResponseDto,
  TranslationStatsDto,
} from './dto/translate.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('translation')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('v1/translation')
export class TranslationController {
  constructor(private readonly translationService: TranslationService) {}

  @Post('translate-product/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Translate a single product from Chinese to Vietnamese',
    description: 'Translates product name and description. Results are cached for 30 days.',
  })
  @ApiParam({
    name: 'id',
    description: 'Product ID',
    example: 'cm123abc456',
  })
  @ApiResponse({
    status: 200,
    description: 'Product translated successfully',
    type: TranslateProductResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Product not found',
  })
  @ApiResponse({
    status: 500,
    description: 'Translation failed',
  })
  async translateProduct(
    @Param('id') id: string,
    @Body() dto: Partial<TranslateProductDto>,
  ): Promise<TranslateProductResponseDto> {
    const result = await this.translationService.translateProduct(
      id,
      dto.sourceLang || 'chinese',
      dto.targetLang || 'vietnamese',
      dto.forceRefresh || false,
    );

    return {
      productId: result.productId,
      sku: result.sku,
      translations: result.translations,
      translatedAt: result.translatedAt,
      cached: result.cached,
    };
  }

  @Post('batch-translate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Batch translate multiple products',
    description: 'Translates multiple products from Chinese to Vietnamese. Results are cached.',
  })
  @ApiResponse({
    status: 200,
    description: 'Batch translation completed',
    type: BatchTranslateResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request',
  })
  async batchTranslate(
    @Body() dto: BatchTranslateDto,
  ): Promise<BatchTranslateResponseDto> {
    const result = await this.translationService.batchTranslate(
      dto.productIds,
      dto.sourceLang || 'chinese',
      dto.targetLang || 'vietnamese',
      dto.forceRefresh || false,
    );

    return {
      total: result.total,
      successful: result.successful,
      failed: result.failed,
      results: result.results.map((r) => ({
        productId: r.productId,
        sku: r.sku,
        translations: r.translations,
        translatedAt: r.translatedAt,
        cached: r.cached,
      })),
      errors: result.errors,
    };
  }

  @Get('cache-stats')
  @ApiOperation({
    summary: 'Get translation cache statistics',
    description: 'Returns cache hit/miss rates and total requests',
  })
  @ApiResponse({
    status: 200,
    description: 'Cache statistics retrieved successfully',
    type: TranslationStatsDto,
  })
  async getCacheStats(): Promise<TranslationStatsDto> {
    return this.translationService.getStats();
  }
}
