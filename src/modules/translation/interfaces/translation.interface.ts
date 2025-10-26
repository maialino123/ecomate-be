/**
 * Translation module interfaces
 */

export interface TranslationRequest {
  text: string | string[];
  sourceLang?: string;
  targetLang?: string;
}

export interface TranslationResponse {
  success: boolean;
  data?: {
    translated_text: string | string[];
    source_lang: string;
    target_lang: string;
    model: string;
  };
  error?: string;
}

export interface TranslationCacheEntry {
  sourceText: string;
  translatedText: string;
  sourceLang: string;
  targetLang: string;
  model: string;
  timestamp: number;
}

export interface ProductTranslationResult {
  productId: string;
  sku: string;
  translations: {
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
  translatedAt: Date;
  cached: boolean;
}

export interface BatchTranslationResult {
  total: number;
  successful: number;
  failed: number;
  results: ProductTranslationResult[];
  errors: Array<{
    productId: string;
    error: string;
  }>;
}

export interface TranslationStats {
  cacheHits: number;
  cacheMisses: number;
  totalRequests: number;
  hitRate: number;
}
