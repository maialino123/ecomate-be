import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@/db/prisma.service';
import {
  CreateCostCalculationDto,
  UpdateCostCalculationDto,
  CostCalculationResponseDto,
  CalculatePriceDto,
  PriceCalculationResultDto,
  QueryCostCalculationDto,
  PaginatedCostCalculationsDto
} from './dto/cost.dto';
import { Decimal } from '@prisma/client/runtime/library';

/**
 * Cost Calculation Service
 * Implements the formula: P = ([(P_nhập + P_shipTQ) × T_CNY→VND + P_shipVN + P_xử_lý] / SL(1-R)) × (1+G) / (1-F)
 */
@Injectable()
export class CostService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Calculate base cost per product (C₀)
   * C₀ = [(P_nhập + P_shipTQ) × T_CNY→VND + P_shipVN + P_xử_lý] / SL
   */
  private calculateBaseCost(params: {
    importPrice: number;
    domesticShippingCN: number;
    internationalShippingVN: number;
    handlingFee: number;
    exchangeRateCNY: number;
    quantity: number;
  }): number {
    const {
      importPrice,
      domesticShippingCN,
      internationalShippingVN,
      handlingFee,
      exchangeRateCNY,
      quantity
    } = params;

    // (P_nhập + P_shipTQ)
    const totalCNYCost = importPrice + domesticShippingCN;

    // (P_nhập + P_shipTQ) × T_CNY→VND
    const totalCNYInVND = totalCNYCost * exchangeRateCNY;

    // [(P_nhập + P_shipTQ) × T_CNY→VND + P_shipVN + P_xử_lý]
    const totalVNDCost = totalCNYInVND + internationalShippingVN + handlingFee;

    // C₀ = Total / SL
    const baseCost = totalVNDCost / quantity;

    return Math.round(baseCost * 100) / 100; // Round to 2 decimal places
  }

  /**
   * Calculate effective cost with return rate (C_eff)
   * C_eff = C₀ / (1 - R)
   */
  private calculateEffectiveCost(baseCost: number, returnRate: number): number {
    if (returnRate >= 1) {
      throw new BadRequestException('Return rate must be less than 1 (100%)');
    }

    const effectiveCost = baseCost / (1 - returnRate);
    return Math.round(effectiveCost * 100) / 100;
  }

  /**
   * Calculate suggested selling price (P)
   * P = C_eff × (1 + G) / (1 - F)
   */
  private calculateSellingPrice(
    effectiveCost: number,
    profitMarginRate: number,
    platformFeeRate: number
  ): number {
    if (platformFeeRate >= 1) {
      throw new BadRequestException('Platform fee rate must be less than 1 (100%)');
    }

    const sellingPrice = (effectiveCost * (1 + profitMarginRate)) / (1 - platformFeeRate);
    return Math.round(sellingPrice * 100) / 100;
  }

  /**
   * Calculate net profit per product (L)
   * L = P × (1 - F) - C_eff
   */
  private calculateNetProfit(
    sellingPrice: number,
    platformFeeRate: number,
    effectiveCost: number
  ): number {
    const netProfit = sellingPrice * (1 - platformFeeRate) - effectiveCost;
    return Math.round(netProfit * 100) / 100;
  }

  /**
   * Calculate break-even price (P_BE)
   * P_BE = C_eff / (1 - F)
   */
  private calculateBreakEvenPrice(effectiveCost: number, platformFeeRate: number): number {
    if (platformFeeRate >= 1) {
      throw new BadRequestException('Platform fee rate must be less than 1 (100%)');
    }

    const breakEvenPrice = effectiveCost / (1 - platformFeeRate);
    return Math.round(breakEvenPrice * 100) / 100;
  }

  /**
   * Perform complete cost calculation
   */
  private performCalculation(input: CalculatePriceDto): PriceCalculationResultDto {
    // Set defaults
    const domesticShippingCN = input.domesticShippingCN ?? 0;
    const internationalShippingVN = input.internationalShippingVN ?? 0;
    const handlingFee = input.handlingFee ?? 0;
    const returnRate = input.returnRate ?? 0;
    const platformFeeRate = input.platformFeeRate ?? 0;
    const profitMarginRate = input.profitMarginRate ?? 0;

    // Step 1: Calculate base cost
    const baseCost = this.calculateBaseCost({
      importPrice: input.importPrice,
      domesticShippingCN,
      internationalShippingVN,
      handlingFee,
      exchangeRateCNY: input.exchangeRateCNY,
      quantity: input.quantity
    });

    // Step 2: Calculate effective cost
    const effectiveCost = this.calculateEffectiveCost(baseCost, returnRate);

    // Step 3: Calculate selling price
    const suggestedSellingPrice = this.calculateSellingPrice(
      effectiveCost,
      profitMarginRate,
      platformFeeRate
    );

    // Step 4: Calculate net profit
    const netProfit = this.calculateNetProfit(
      suggestedSellingPrice,
      platformFeeRate,
      effectiveCost
    );

    // Step 5: Calculate break-even price
    const breakEvenPrice = this.calculateBreakEvenPrice(effectiveCost, platformFeeRate);

    // Build detailed breakdown
    const totalCNYCost = input.importPrice + domesticShippingCN;
    const totalCNYInVND = totalCNYCost * input.exchangeRateCNY;
    const totalVNDCost = totalCNYInVND + internationalShippingVN + handlingFee;

    const calculationBreakdown = {
      inputs: {
        importPriceCNY: input.importPrice,
        domesticShippingCNY: domesticShippingCN,
        internationalShippingVND: internationalShippingVN,
        handlingFeeVND: handlingFee,
        exchangeRateCNY: input.exchangeRateCNY,
        quantity: input.quantity,
        returnRate: returnRate,
        platformFeeRate: platformFeeRate,
        profitMarginRate: profitMarginRate
      },
      steps: {
        totalCNYCost,
        totalCNYInVND,
        totalVNDCost,
        baseCostPerUnit: baseCost,
        effectiveCostPerUnit: effectiveCost,
        priceBeforePlatformFee: suggestedSellingPrice * (1 - platformFeeRate),
        suggestedPrice: suggestedSellingPrice,
        netProfitPerUnit: netProfit,
        breakEvenPrice
      },
      percentages: {
        profitMarginPercentage: effectiveCost > 0 ? (netProfit / effectiveCost) * 100 : 0,
        platformFeePercentage: platformFeeRate * 100,
        returnRatePercentage: returnRate * 100
      }
    };

    return {
      baseCost,
      effectiveCost,
      suggestedSellingPrice,
      netProfit,
      breakEvenPrice,
      calculationBreakdown
    };
  }

  /**
   * Quick price calculation (without saving to DB)
   */
  async calculatePrice(dto: CalculatePriceDto): Promise<PriceCalculationResultDto> {
    return this.performCalculation(dto);
  }

  /**
   * Create and save cost calculation
   */
  async createCostCalculation(
    userId: string,
    dto: CreateCostCalculationDto
  ): Promise<CostCalculationResponseDto> {
    // Verify product exists
    const product = await this.prisma.product.findUnique({
      where: { id: dto.productId }
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    // Perform calculation
    const calculation = this.performCalculation(dto);

    // Set defaults
    const domesticShippingCN = dto.domesticShippingCN ?? 0;
    const internationalShippingVN = dto.internationalShippingVN ?? 0;
    const handlingFee = dto.handlingFee ?? 0;
    const returnRate = dto.returnRate ?? 0;
    const platformFeeRate = dto.platformFeeRate ?? 0;
    const profitMarginRate = dto.profitMarginRate ?? 0;
    const currency = dto.currency ?? 'VND';

    // Save to database
    const costCalculation = await this.prisma.costCalculation.create({
      data: {
        productId: dto.productId,
        userId,
        importPrice: new Decimal(dto.importPrice),
        domesticShippingCN: new Decimal(domesticShippingCN),
        internationalShippingVN: new Decimal(internationalShippingVN),
        handlingFee: new Decimal(handlingFee),
        exchangeRateCNY: new Decimal(dto.exchangeRateCNY),
        quantity: dto.quantity,
        returnRate: new Decimal(returnRate),
        platformFeeRate: new Decimal(platformFeeRate),
        profitMarginRate: new Decimal(profitMarginRate),
        baseCost: new Decimal(calculation.baseCost),
        effectiveCost: new Decimal(calculation.effectiveCost),
        suggestedSellingPrice: new Decimal(calculation.suggestedSellingPrice),
        netProfit: new Decimal(calculation.netProfit),
        breakEvenPrice: new Decimal(calculation.breakEvenPrice),
        currency,
        notes: dto.notes,
        calculationData: calculation.calculationBreakdown
      }
    });

    return this.mapToResponseDto(costCalculation);
  }

  /**
   * Update cost calculation
   */
  async updateCostCalculation(
    id: string,
    userId: string,
    dto: UpdateCostCalculationDto
  ): Promise<CostCalculationResponseDto> {
    // Get existing calculation
    const existing = await this.prisma.costCalculation.findUnique({
      where: { id }
    });

    if (!existing) {
      throw new NotFoundException('Cost calculation not found');
    }

    // Verify ownership
    if (existing.userId !== userId) {
      throw new BadRequestException('You do not have permission to update this calculation');
    }

    // Merge with existing data - use toNumber() for proper Decimal conversion
    const merged = {
      importPrice: dto.importPrice ?? existing.importPrice.toNumber(),
      domesticShippingCN: dto.domesticShippingCN ?? existing.domesticShippingCN.toNumber(),
      internationalShippingVN: dto.internationalShippingVN ?? existing.internationalShippingVN.toNumber(),
      handlingFee: dto.handlingFee ?? existing.handlingFee.toNumber(),
      exchangeRateCNY: dto.exchangeRateCNY ?? existing.exchangeRateCNY.toNumber(),
      quantity: dto.quantity ?? existing.quantity,
      returnRate: dto.returnRate ?? existing.returnRate.toNumber(),
      platformFeeRate: dto.platformFeeRate ?? existing.platformFeeRate.toNumber(),
      profitMarginRate: dto.profitMarginRate ?? existing.profitMarginRate.toNumber()
    };

    // Validate merged data
    if (isNaN(merged.importPrice) || isNaN(merged.exchangeRateCNY)) {
      throw new BadRequestException('Invalid numeric values provided');
    }

    // Recalculate
    const calculation = this.performCalculation(merged);

    // Update database
    const updated = await this.prisma.costCalculation.update({
      where: { id },
      data: {
        importPrice: new Decimal(merged.importPrice),
        domesticShippingCN: new Decimal(merged.domesticShippingCN),
        internationalShippingVN: new Decimal(merged.internationalShippingVN),
        handlingFee: new Decimal(merged.handlingFee),
        exchangeRateCNY: new Decimal(merged.exchangeRateCNY),
        quantity: merged.quantity,
        returnRate: new Decimal(merged.returnRate),
        platformFeeRate: new Decimal(merged.platformFeeRate),
        profitMarginRate: new Decimal(merged.profitMarginRate),
        baseCost: new Decimal(calculation.baseCost),
        effectiveCost: new Decimal(calculation.effectiveCost),
        suggestedSellingPrice: new Decimal(calculation.suggestedSellingPrice),
        netProfit: new Decimal(calculation.netProfit),
        breakEvenPrice: new Decimal(calculation.breakEvenPrice),
        currency: dto.currency ?? existing.currency,
        notes: dto.notes ?? existing.notes,
        calculationData: calculation.calculationBreakdown
      }
    });

    return this.mapToResponseDto(updated);
  }

  /**
   * Get cost calculation by ID
   */
  async getCostCalculation(id: string): Promise<CostCalculationResponseDto> {
    const calculation = await this.prisma.costCalculation.findUnique({
      where: { id }
    });

    if (!calculation) {
      throw new NotFoundException('Cost calculation not found');
    }

    return this.mapToResponseDto(calculation);
  }

  /**
   * Get all cost calculations for a product
   */
  async getCostCalculationsByProduct(
    productId: string,
    query: QueryCostCalculationDto
  ): Promise<PaginatedCostCalculationsDto> {
    const { page = 1, limit = 10, sortBy = 'createdAt', sortOrder = 'desc' } = query;
    const skip = (page - 1) * limit;

    const [calculations, total] = await Promise.all([
      this.prisma.costCalculation.findMany({
        where: { productId },
        orderBy: { [sortBy]: sortOrder },
        skip,
        take: limit
      }),
      this.prisma.costCalculation.count({ where: { productId } })
    ]);

    return {
      data: calculations.map(c => this.mapToResponseDto(c)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  /**
   * Get latest cost calculation for a product
   */
  async getLatestCostCalculation(productId: string): Promise<CostCalculationResponseDto | null> {
    const calculation = await this.prisma.costCalculation.findFirst({
      where: { productId },
      orderBy: { createdAt: 'desc' }
    });

    if (!calculation) {
      return null;
    }

    return this.mapToResponseDto(calculation);
  }

  /**
   * Delete cost calculation
   */
  async deleteCostCalculation(id: string, userId: string): Promise<void> {
    const existing = await this.prisma.costCalculation.findUnique({
      where: { id }
    });

    if (!existing) {
      throw new NotFoundException('Cost calculation not found');
    }

    // Verify ownership
    if (existing.userId !== userId) {
      throw new BadRequestException('You do not have permission to delete this calculation');
    }

    await this.prisma.costCalculation.delete({
      where: { id }
    });
  }

  /**
   * Map Prisma model to response DTO
   */
  private mapToResponseDto(calculation: any): CostCalculationResponseDto {
    return {
      id: calculation.id,
      productId: calculation.productId,
      userId: calculation.userId,
      importPrice: Number(calculation.importPrice),
      domesticShippingCN: Number(calculation.domesticShippingCN),
      internationalShippingVN: Number(calculation.internationalShippingVN),
      handlingFee: Number(calculation.handlingFee),
      exchangeRateCNY: Number(calculation.exchangeRateCNY),
      quantity: calculation.quantity,
      returnRate: Number(calculation.returnRate),
      platformFeeRate: Number(calculation.platformFeeRate),
      profitMarginRate: Number(calculation.profitMarginRate),
      baseCost: Number(calculation.baseCost),
      effectiveCost: Number(calculation.effectiveCost),
      suggestedSellingPrice: Number(calculation.suggestedSellingPrice),
      netProfit: Number(calculation.netProfit),
      breakEvenPrice: Number(calculation.breakEvenPrice),
      currency: calculation.currency,
      notes: calculation.notes,
      calculationData: calculation.calculationData,
      createdAt: calculation.createdAt,
      updatedAt: calculation.updatedAt
    };
  }
}
