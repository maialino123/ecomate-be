import { Injectable, Logger, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '@db/prisma.service';
import { RedisService } from '@utils/redis/redis.service';
import { EnvService } from '@env/env.service';
import * as crypto from 'crypto';
import {
  TranslationRequest,
  TranslationResponse,
  ProductTranslationResult,
  BatchTranslationResult,
  TranslationStats,
  TranslationCacheEntry,
} from './interfaces/translation.interface';

@Injectable()
export class TranslationService {
  private readonly logger = new Logger(TranslationService.name);
  private readonly workerUrl: string;
  private readonly workerToken: string | undefined;
  private readonly cacheTtl: number;
  private readonly maxRetries = 3;
  private readonly retryDelay = 1000; // milliseconds

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private envService: EnvService,
  ) {
    // Get config from environment
    this.workerUrl = process.env.CLOUDFLARE_WORKER_AI_URL || '';
    this.workerToken = process.env.CLOUDFLARE_WORKER_AI_TOKEN;
    this.cacheTtl = Number(process.env.TRANSLATION_CACHE_TTL) || 2592000; // 30 days

    if (!this.workerUrl) {
      this.logger.warn('⚠️  CLOUDFLARE_WORKER_AI_URL not configured - translation will fail');
    }
  }

  /**
   * Translate a single product
   */
  async translateProduct(
    productId: string,
    sourceLang = 'chinese',
    targetLang = 'vietnamese',
    forceRefresh = false,
  ): Promise<ProductTranslationResult> {
    this.logger.log(`Translating product ${productId} from ${sourceLang} to ${targetLang}`);

    // Fetch product from database
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${productId} not found`);
    }

    const translations: ProductTranslationResult['translations'] = {};
    let cached = false;

    // Translate product name
    if (product.name) {
      const nameTranslation = await this.translateText(
        product.name,
        sourceLang,
        targetLang,
        forceRefresh,
      );
      translations.name = {
        original: product.name,
        translated: nameTranslation.text,
      };
      cached = nameTranslation.cached;
    }

    // Translate product description
    if (product.description) {
      const descTranslation = await this.translateText(
        product.description,
        sourceLang,
        targetLang,
        forceRefresh,
      );
      translations.description = {
        original: product.description,
        translated: descTranslation.text,
      };
      cached = cached && descTranslation.cached;
    }

    // Update product in database
    const translatedAt = new Date();
    await this.prisma.product.update({
      where: { id: productId },
      data: {
        nameZh: product.name, // Store original Chinese name
        descriptionZh: product.description, // Store original Chinese description
        name: translations.name?.translated || product.name,
        description: translations.description?.translated || product.description,
        translatedAt,
        translationMeta: {
          source: sourceLang,
          target: targetLang,
          provider: 'cloudflare-ai',
          model: '@cf/meta/m2m100-1.2b',
          translatedAt: translatedAt.toISOString(),
        },
      },
    });

    this.logger.log(`✅ Product ${productId} translated successfully`);

    return {
      productId,
      sku: product.sku,
      translations,
      translatedAt,
      cached,
    };
  }

  /**
   * Batch translate multiple products
   */
  async batchTranslate(
    productIds: string[],
    sourceLang = 'chinese',
    targetLang = 'vietnamese',
    forceRefresh = false,
  ): Promise<BatchTranslationResult> {
    this.logger.log(`Batch translating ${productIds.length} products`);

    const results: ProductTranslationResult[] = [];
    const errors: Array<{ productId: string; error: string }> = [];

    // Translate each product sequentially (to avoid rate limits)
    for (const productId of productIds) {
      try {
        const result = await this.translateProduct(
          productId,
          sourceLang,
          targetLang,
          forceRefresh,
        );
        results.push(result);
      } catch (error: any) {
        this.logger.error(`Failed to translate product ${productId}:`, error.message);
        errors.push({
          productId,
          error: error.message || 'Translation failed',
        });
      }
    }

    return {
      total: productIds.length,
      successful: results.length,
      failed: errors.length,
      results,
      errors,
    };
  }

  /**
   * Translate text using Cloudflare Worker AI
   * Implements caching and retry logic
   */
  private async translateText(
    text: string,
    sourceLang: string,
    targetLang: string,
    forceRefresh: boolean,
  ): Promise<{ text: string; cached: boolean }> {
    // Generate cache key
    const cacheKey = this.generateCacheKey(text, sourceLang, targetLang);

    // Check cache first (unless force refresh)
    if (!forceRefresh) {
      const cachedResult = await this.getCachedTranslation(cacheKey);
      if (cachedResult) {
        this.logger.debug(`Cache hit for: ${text.substring(0, 50)}...`);
        await this.incrementStat('cacheHits');
        return { text: cachedResult, cached: true };
      }
    }

    // Cache miss - call Worker AI
    this.logger.debug(`Cache miss for: ${text.substring(0, 50)}...`);
    await this.incrementStat('cacheMisses');

    const translatedText = await this.callWorkerAI(text, sourceLang, targetLang);

    // Store in cache
    await this.cacheTranslation(cacheKey, text, translatedText, sourceLang, targetLang);

    return { text: translatedText, cached: false };
  }

  /**
   * Call Cloudflare Worker AI with retry logic
   */
  private async callWorkerAI(
    text: string,
    sourceLang: string,
    targetLang: string,
  ): Promise<string> {
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await fetch(this.workerUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(this.workerToken && { Authorization: `Bearer ${this.workerToken}` }),
          },
          body: JSON.stringify({
            text,
            sourceLang,
            targetLang,
          } as TranslationRequest),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Worker AI returned ${response.status}: ${errorText}`);
        }

        const result = await response.json() as TranslationResponse;

        if (!result.success || !result.data) {
          throw new Error(result.error || 'Translation failed');
        }

        return result.data.translated_text as string;

      } catch (error: any) {
        this.logger.warn(`Attempt ${attempt}/${this.maxRetries} failed: ${error.message}`);

        if (attempt === this.maxRetries) {
          throw new InternalServerErrorException(
            `Translation failed after ${this.maxRetries} attempts: ${error.message}`,
          );
        }

        // Exponential backoff
        await this.sleep(this.retryDelay * Math.pow(2, attempt - 1));
      }
    }

    // Should never reach here
    throw new InternalServerErrorException('Translation failed');
  }

  /**
   * Generate cache key for translation
   */
  private generateCacheKey(text: string, sourceLang: string, targetLang: string): string {
    const hash = crypto
      .createHash('md5')
      .update(`${text}:${sourceLang}:${targetLang}`)
      .digest('hex');
    return `translation:${sourceLang}-${targetLang}:${hash}`;
  }

  /**
   * Get cached translation
   */
  private async getCachedTranslation(cacheKey: string): Promise<string | null> {
    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        const entry = JSON.parse(cached) as TranslationCacheEntry;
        return entry.translatedText;
      }
    } catch (error) {
      this.logger.warn(`Failed to get cache: ${error}`);
    }
    return null;
  }

  /**
   * Cache translation result
   */
  private async cacheTranslation(
    cacheKey: string,
    sourceText: string,
    translatedText: string,
    sourceLang: string,
    targetLang: string,
  ): Promise<void> {
    try {
      const entry: TranslationCacheEntry = {
        sourceText,
        translatedText,
        sourceLang,
        targetLang,
        model: '@cf/meta/m2m100-1.2b',
        timestamp: Date.now(),
      };
      await this.redis.set(cacheKey, JSON.stringify(entry), this.cacheTtl);
    } catch (error) {
      this.logger.warn(`Failed to cache translation: ${error}`);
    }
  }

  /**
   * Get translation cache statistics
   */
  async getStats(): Promise<TranslationStats> {
    try {
      const hits = Number(await this.redis.get('translation:stats:hits')) || 0;
      const misses = Number(await this.redis.get('translation:stats:misses')) || 0;
      const total = hits + misses;
      const hitRate = total > 0 ? (hits / total) * 100 : 0;

      return {
        cacheHits: hits,
        cacheMisses: misses,
        totalRequests: total,
        hitRate: Math.round(hitRate * 100) / 100,
      };
    } catch (error) {
      this.logger.warn(`Failed to get stats: ${error}`);
      return {
        cacheHits: 0,
        cacheMisses: 0,
        totalRequests: 0,
        hitRate: 0,
      };
    }
  }

  /**
   * Increment stat counter
   */
  private async incrementStat(stat: 'cacheHits' | 'cacheMisses'): Promise<void> {
    try {
      const key = stat === 'cacheHits' ? 'translation:stats:hits' : 'translation:stats:misses';
      await this.redis.incr(key);
    } catch (error) {
      this.logger.warn(`Failed to increment stat: ${error}`);
    }
  }

  /**
   * Sleep utility for retry delay
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
