import { Product1688Status, RejectionReason } from '@prisma/client';

/**
 * 1688 Product Variant interface
 */
export interface Product1688Variant {
  sku: string; // 1688 SKU code
  nameZh: string; // Chinese name
  nameVi?: string; // Vietnamese name (after translation)
  attributes: Record<string, string>; // e.g., {color: "红色", size: "L"}
  price: number; // Price in CNY
  stock?: number; // Stock quantity
  image?: string; // SKU variant image URL
  costCalculation?: {
    // Latest cost calculation results
    baseCost: number;
    effectiveCost: number;
    suggestedSellingPrice: number;
    netProfit: number;
    breakEvenPrice: number;
    lastCalculatedAt: string;
  };
}

/**
 * Cost Calculation interface
 */
export interface CostCalculation {
  importPrice: number; // Product cost in CNY
  domesticShippingCN?: number; // Shipping within China
  internationalShippingVN?: number; // International shipping
  handlingFee?: number; // Handling/processing fee
  exchangeRateCNY: number; // CNY to VND exchange rate
  quantity?: number; // Order quantity
  returnRate?: number; // Return/refund rate (0-1)
  platformFeeRate?: number; // Platform fee rate (0-1)
  profitMarginRate?: number; // Profit margin rate (0-1)
  finalPriceVND?: number; // Calculated final price in VND
}

/**
 * Translation progress
 */
export interface TranslationProgress {
  total: number;
  completed: number;
  failed: number;
  items: Array<{
    field: string;
    status: 'pending' | 'completed' | 'failed';
    error?: string;
  }>;
}

/**
 * Duplicate check result
 */
export interface DuplicateCheckResult {
  exists: boolean;
  type?: 'product1688' | 'product';
  id?: string;
  name?: string;
}

/**
 * Approve result
 */
export interface ApproveResult {
  success: boolean;
  product: any; // Product
  product1688: any; // Product1688
}

/**
 * Query result
 */
export interface QueryResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}
