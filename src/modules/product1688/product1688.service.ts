import { Injectable, Logger, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@db/prisma.service';
import { Product1688Status, RejectionReason } from '@prisma/client';
import { TranslationService } from '../translation/translation.service';
import { CreateProduct1688Dto } from './dto/create-product1688.dto';
import { UpdateProduct1688Dto } from './dto/update-product1688.dto';
import { TranslateProduct1688Dto } from './dto/translate-product1688.dto';
import { ApproveProduct1688Dto } from './dto/approve-product1688.dto';
import { RejectProduct1688Dto } from './dto/reject-product1688.dto';
import { QueryProduct1688Dto } from './dto/query-product1688.dto';
import { SaveCostCalculationDto } from './dto/save-cost-calculation.dto';
import {
  DuplicateCheckResult,
  ApproveResult,
  QueryResult,
  Product1688Variant,
  TranslationProgress,
} from './interfaces/product1688.interface';

@Injectable()
export class Product1688Service {
  private readonly logger = new Logger(Product1688Service.name);

  constructor(
    private prisma: PrismaService,
    private translationService: TranslationService,
  ) {}

  /**
   * Create new Product1688 from extension
   */
  async create(userId: string, dto: CreateProduct1688Dto) {
    this.logger.log(`Creating Product1688 from URL: ${dto.originalUrl}`);

    // Check for duplicates first
    const duplicate = await this.checkDuplicate(dto.originalUrl);
    if (duplicate.exists) {
      throw new ConflictException({
        message: duplicate.type === 'product1688'
          ? 'Sản phẩm này đã được lưu vào danh sách chờ duyệt'
          : 'Sản phẩm này đã được import vào kho',
        existingId: duplicate.id,
        existingType: duplicate.type,
      });
    }

    // Calculate variant count
    const variantCount = dto.variants ? (Array.isArray(dto.variants) ? dto.variants.length : 0) : 0;

    // Create Product1688
    const product1688 = await this.prisma.product1688.create({
      data: {
        nameZh: dto.nameZh,
        descriptionZh: dto.descriptionZh,
        originalUrl: dto.originalUrl,
        priceMinCNY: dto.priceMinCNY,
        priceMaxCNY: dto.priceMaxCNY,
        images: dto.images,
        thumbnail: dto.thumbnail || dto.images[0],
        variants: dto.variants,
        variantCount,
        supplierName: dto.supplierName,
        supplierId1688: dto.supplierId1688,
        createdBy: userId,
        status: Product1688Status.PENDING_REVIEW,
      },
      include: {
        createdByUser: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    this.logger.log(`✅ Product1688 created: ${product1688.id}`);
    return product1688;
  }

  /**
   * Check if product already exists (in Product1688 or Product)
   */
  async checkDuplicate(originalUrl: string): Promise<DuplicateCheckResult> {
    // Check in Product1688 (temp table)
    const existingProduct1688 = await this.prisma.product1688.findUnique({
      where: { originalUrl },
      select: { id: true, nameZh: true, nameVi: true },
    });

    if (existingProduct1688) {
      return {
        exists: true,
        type: 'product1688',
        id: existingProduct1688.id,
        name: existingProduct1688.nameVi || existingProduct1688.nameZh,
      };
    }

    // Check in Product (final table) - check if any Product has this URL in metadata
    // Note: This assumes products imported from 1688 store originalUrl in metadata
    const existingProduct = await this.prisma.product.findFirst({
      where: {
        metadata: {
          path: ['originalUrl'],
          equals: originalUrl,
        },
      },
      select: { id: true, name: true },
    });

    if (existingProduct) {
      return {
        exists: true,
        type: 'product',
        id: existingProduct.id,
        name: existingProduct.name,
      };
    }

    return { exists: false };
  }

  /**
   * List products with filters and pagination
   */
  async findAll(query: QueryProduct1688Dto): Promise<QueryResult<any>> {
    const {
      status,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      page = 1,
      limit = 20,
    } = query;

    const skip = (page - 1) * limit;

    // Build where clause
    const where: any = {};

    if (status) {
      where.status = status;
    }

    if (search) {
      where.OR = [
        { nameZh: { contains: search, mode: 'insensitive' } },
        { nameVi: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Get total count
    const total = await this.prisma.product1688.count({ where });

    // Get paginated results
    const data = await this.prisma.product1688.findMany({
      where,
      skip,
      take: limit,
      orderBy: { [sortBy]: sortOrder },
      include: {
        createdByUser: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        reviewedByUser: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    return {
      data,
      total,
      page,
      limit,
    };
  }

  /**
   * Get single product by ID
   */
  async findOne(id: string) {
    const product = await this.prisma.product1688.findUnique({
      where: { id },
      include: {
        createdByUser: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        reviewedByUser: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        rejectedByUser: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        product: true, // Include linked product if approved
      },
    });

    if (!product) {
      throw new NotFoundException(`Product1688 with ID ${id} not found`);
    }

    return product;
  }

  /**
   * Update product (manual edits)
   */
  async update(id: string, dto: UpdateProduct1688Dto) {
    const product = await this.findOne(id);

    const updated = await this.prisma.product1688.update({
      where: { id },
      data: {
        nameVi: dto.nameVi,
        descriptionVi: dto.descriptionVi,
        variants: dto.variants,
        costCalculation: dto.costCalculation,
      },
    });

    this.logger.log(`✅ Product1688 updated: ${id}`);
    return updated;
  }

  /**
   * Translate product (name, description, variants)
   */
  async translate(id: string, dto: TranslateProduct1688Dto) {
    const product = await this.findOne(id);

    const {
      translateName = true,
      translateDescription = true,
      translateVariants = true,
      forceRefresh = false,
    } = dto;

    const progress: TranslationProgress = {
      total: 0,
      completed: 0,
      failed: 0,
      items: [],
    };

    const updates: any = {};

    // Translate name
    if (translateName && product.nameZh) {
      progress.total++;
      progress.items.push({ field: 'name', status: 'pending' });

      try {
        const translation = await this.translationService.translateText(
          product.nameZh,
          'zh',
          'vi',
          forceRefresh,
        );
        updates.nameVi = translation.text;
        progress.completed++;
        progress.items[progress.items.length - 1].status = 'completed';
        this.logger.debug(`✅ Name translated: ${product.nameZh} → ${translation.text}`);
      } catch (error: any) {
        progress.failed++;
        progress.items[progress.items.length - 1].status = 'failed';
        progress.items[progress.items.length - 1].error = error.message;
        this.logger.error(`❌ Name translation failed: ${error.message}`);
      }
    }

    // Translate description
    if (translateDescription && product.descriptionZh) {
      progress.total++;
      progress.items.push({ field: 'description', status: 'pending' });

      try {
        const translation = await this.translationService.translateText(
          product.descriptionZh,
          'zh',
          'vi',
          forceRefresh,
        );
        updates.descriptionVi = translation.text;
        progress.completed++;
        progress.items[progress.items.length - 1].status = 'completed';
        this.logger.debug(`✅ Description translated`);
      } catch (error: any) {
        progress.failed++;
        progress.items[progress.items.length - 1].status = 'failed';
        progress.items[progress.items.length - 1].error = error.message;
        this.logger.error(`❌ Description translation failed: ${error.message}`);
      }
    }

    // Translate variants
    if (translateVariants && product.variants) {
      const variants = Array.isArray(product.variants) ? product.variants : [];
      const translatedVariants: any[] = [];

      for (const variantData of variants) {
        const variant = variantData as any;
        progress.total++;
        progress.items.push({ field: `variant-${variant.sku}`, status: 'pending' });

        try {
          const translatedVariant = { ...variant } as any;

          // Translate variant name
          if (variant.nameZh) {
            const translation = await this.translationService.translateText(
              variant.nameZh,
              'zh',
              'vi',
              forceRefresh,
            );
            translatedVariant.nameVi = translation.text;
          }

          // Translate attributes
          if (variant.attributes) {
            const translatedAttributes: Record<string, any> = {};
            for (const [key, value] of Object.entries(variant.attributes)) {
              if (typeof value === 'string') {
                const translation = await this.translationService.translateText(
                  value,
                  'zh',
                  'vi',
                  forceRefresh,
                );
                translatedAttributes[key] = translation.text;
              } else {
                translatedAttributes[key] = value as string;
              }
            }
            translatedVariant.attributes = translatedAttributes;
          }

          translatedVariants.push(translatedVariant);
          progress.completed++;
          progress.items[progress.items.length - 1].status = 'completed';
          this.logger.debug(`✅ Variant ${variant.sku} translated`);
        } catch (error: any) {
          translatedVariants.push(variant); // Keep original on error
          progress.failed++;
          progress.items[progress.items.length - 1].status = 'failed';
          progress.items[progress.items.length - 1].error = error.message;
          this.logger.error(`❌ Variant ${variant.sku} translation failed: ${error.message}`);
        }
      }

      updates.variants = translatedVariants;
    }

    // Update status to TRANSLATED if at least name or description translated
    if (updates.nameVi || updates.descriptionVi) {
      updates.status = Product1688Status.TRANSLATED;
    }

    // Save updates
    const updated = await this.prisma.product1688.update({
      where: { id },
      data: updates,
    });

    this.logger.log(`✅ Product1688 translated: ${id} (${progress.completed}/${progress.total} successful)`);

    return {
      product: updated,
      progress,
    };
  }

  /**
   * Approve and import to Product
   */
  async approve(id: string, userId: string, dto: ApproveProduct1688Dto): Promise<ApproveResult> {
    const product1688 = await this.findOne(id);

    // Validate status - prevent double approval
    if (product1688.status === Product1688Status.APPROVED) {
      throw new BadRequestException('Product already approved');
    }

    // Optional: Allow re-approval of rejected products
    // (Business decision - currently allowed)
    // if (product1688.status === Product1688Status.REJECTED) {
    //   throw new BadRequestException('Cannot approve a rejected product');
    // }

    // Check SKU uniqueness
    const existingSku = await this.prisma.product.findUnique({
      where: { sku: dto.sku },
    });

    if (existingSku) {
      throw new ConflictException(`SKU "${dto.sku}" already exists`);
    }

    // Handle supplier
    let supplierId = dto.supplierId;

    if (dto.createSupplier && product1688.supplierName) {
      // Create new supplier from 1688 data
      // Generate unique code
      const supplierCode = `1688-${product1688.supplierId1688 || Date.now()}`;

      const newSupplier = await this.prisma.supplier.create({
        data: {
          code: supplierCode,
          name: product1688.supplierName,
          contactPerson: product1688.supplierName,
          is1688: true,
          storeId1688: product1688.supplierId1688,
          metadata: {
            source: '1688',
            supplierId1688: product1688.supplierId1688,
          },
          userId,
        },
      });
      supplierId = newSupplier.id;
      this.logger.log(`✅ Created supplier: ${newSupplier.name}`);
    }

    // Calculate final price
    const costCalc = product1688.costCalculation as any;
    const finalPrice = costCalc?.finalPriceVND || product1688.priceMinCNY * 3600;

    // Create Product
    const product = await this.prisma.product.create({
      data: {
        sku: dto.sku,
        name: product1688.nameVi || product1688.nameZh,
        description: product1688.descriptionVi || product1688.descriptionZh,
        nameZh: product1688.nameZh,
        descriptionZh: product1688.descriptionZh,
        category: dto.categoryId,
        basePrice: product1688.priceMinCNY,
        sellingPrice: finalPrice,
        currency: 'VND',
        mainImage: product1688.thumbnail || product1688.images[0],
        images: product1688.images,
        supplierId,
        userId,
        status: 'DRAFT' as any, // ProductStatus.DRAFT
        metadata: {
          source: '1688',
          originalUrl: product1688.originalUrl,
          product1688Id: product1688.id,
          costCalculation: product1688.costCalculation,
        },
      },
    });

    this.logger.log(`✅ Product created: ${product.id}`);

    // Create ProductVariants if variants exist
    if (product1688.variants && Array.isArray(product1688.variants)) {
      for (const variantData of product1688.variants) {
        const variant = variantData as any;
        // Note: ProductVariant model may not exist yet - this is placeholder
        // You may need to create ProductVariant records if model exists
        this.logger.debug(`Variant: ${variant.sku} - ${variant.nameVi || variant.nameZh}`);
      }
    }

    // Update Product1688 status
    const updatedProduct1688 = await this.prisma.product1688.update({
      where: { id },
      data: {
        status: Product1688Status.APPROVED,
        reviewedBy: userId,
        productId: product.id,
      },
    });

    this.logger.log(`✅ Product1688 approved: ${id}`);

    return {
      success: true,
      product,
      product1688: updatedProduct1688,
    };
  }

  /**
   * Reject product
   */
  async reject(id: string, userId: string, dto: RejectProduct1688Dto) {
    const product = await this.findOne(id);

    // Check if already rejected
    if (product.status === Product1688Status.REJECTED) {
      throw new BadRequestException('Product already rejected');
    }

    // FIX: Prevent rejecting approved products
    if (product.status === Product1688Status.APPROVED) {
      throw new BadRequestException(
        'Cannot reject an approved product. The product has already been imported to the catalog. ' +
        'Please delete the imported product first if you need to reject this.'
      );
    }

    const updated = await this.prisma.product1688.update({
      where: { id },
      data: {
        status: Product1688Status.REJECTED,
        rejectionReason: dto.reason,
        rejectedBy: userId,
        rejectedAt: new Date(),
        reviewedBy: userId,
      },
    });

    this.logger.log(`✅ Product1688 rejected: ${id} (Reason: ${dto.reason})`);
    return updated;
  }

  /**
   * Delete product (soft delete by status)
   */
  async remove(id: string) {
    const product = await this.findOne(id);

    if (product.status === Product1688Status.APPROVED) {
      throw new BadRequestException('Cannot delete approved product');
    }

    await this.prisma.product1688.delete({
      where: { id },
    });

    this.logger.log(`✅ Product1688 deleted: ${id}`);
    return { success: true };
  }

  /**
   * Calculate cost based on input parameters
   * Formula from CostCalculation model:
   * - C₀ = (P_nhập + P_shipTQ) × T_CNY→VND + (P_shipVN + P_xử lý) / SL
   * - C_eff = C₀ / (1 - R)
   * - P = C_eff / (1 - F) / (1 - G)
   * - L = P × (1 - F) - C_eff
   * - P_BE = C_eff / (1 - F)
   */
  private calculateCost(params: {
    importPrice: number;
    domesticShippingCN: number;
    internationalShippingVN: number;
    handlingFee: number;
    exchangeRateCNY: number;
    quantity: number;
    returnRate: number;
    platformFeeRate: number;
    profitMarginRate: number;
  }) {
    const {
      importPrice,
      domesticShippingCN,
      internationalShippingVN,
      handlingFee,
      exchangeRateCNY,
      quantity,
      returnRate,
      platformFeeRate,
      profitMarginRate,
    } = params;

    // C₀: Base cost per item (VND)
    const baseCost =
      (importPrice + domesticShippingCN) * exchangeRateCNY +
      (internationalShippingVN + handlingFee) / quantity;

    // C_eff: Effective cost (accounting for returns) (VND)
    const effectiveCost = baseCost / (1 - returnRate);

    // P: Suggested selling price (VND)
    const suggestedSellingPrice =
      effectiveCost / (1 - platformFeeRate) / (1 - profitMarginRate);

    // L: Net profit per item (VND)
    const netProfit = suggestedSellingPrice * (1 - platformFeeRate) - effectiveCost;

    // P_BE: Break-even price (VND)
    const breakEvenPrice = effectiveCost / (1 - platformFeeRate);

    return {
      baseCost: Math.round(baseCost * 100) / 100,
      effectiveCost: Math.round(effectiveCost * 100) / 100,
      suggestedSellingPrice: Math.round(suggestedSellingPrice * 100) / 100,
      netProfit: Math.round(netProfit * 100) / 100,
      breakEvenPrice: Math.round(breakEvenPrice * 100) / 100,
    };
  }

  /**
   * Save variant cost calculation
   */
  async saveVariantCostCalculation(userId: string, dto: SaveCostCalculationDto) {
    this.logger.log(
      `Saving cost calculation for variant ${dto.variantSku} of product ${dto.product1688Id}`,
    );

    // Verify product exists
    const product = await this.findOne(dto.product1688Id);

    // Verify variant exists in product
    const variants = Array.isArray(product.variants) ? product.variants : [];
    const variant = variants.find((v: any) => v.sku === dto.variantSku);

    if (!variant) {
      throw new NotFoundException(
        `Variant with SKU "${dto.variantSku}" not found in product ${dto.product1688Id}`,
      );
    }

    // Set defaults
    const domesticShippingCN = dto.domesticShippingCN ?? 0;
    const internationalShippingVN = dto.internationalShippingVN ?? 0;
    const handlingFee = dto.handlingFee ?? 0;
    const quantity = dto.quantity ?? 1;
    const returnRate = dto.returnRate ?? 0;
    const platformFeeRate = dto.platformFeeRate ?? 0;
    const profitMarginRate = dto.profitMarginRate ?? 0;

    // Calculate costs
    const calculated = this.calculateCost({
      importPrice: dto.importPrice,
      domesticShippingCN,
      internationalShippingVN,
      handlingFee,
      exchangeRateCNY: dto.exchangeRateCNY,
      quantity,
      returnRate,
      platformFeeRate,
      profitMarginRate,
    });

    // Prepare calculation data for audit
    const calculationData = {
      inputs: {
        importPrice: dto.importPrice,
        domesticShippingCN,
        internationalShippingVN,
        handlingFee,
        exchangeRateCNY: dto.exchangeRateCNY,
        quantity,
        returnRate,
        platformFeeRate,
        profitMarginRate,
      },
      outputs: calculated,
      formula: {
        baseCost: '(P_nhập + P_shipTQ) × T_CNY→VND + (P_shipVN + P_xử lý) / SL',
        effectiveCost: 'C₀ / (1 - R)',
        suggestedSellingPrice: 'C_eff / (1 - F) / (1 - G)',
        netProfit: 'P × (1 - F) - C_eff',
        breakEvenPrice: 'C_eff / (1 - F)',
      },
    };

    // Save to history
    const history = await this.prisma.product1688VariantCostHistory.create({
      data: {
        product1688Id: dto.product1688Id,
        variantSku: dto.variantSku,
        userId,
        importPrice: dto.importPrice,
        domesticShippingCN,
        internationalShippingVN,
        handlingFee,
        exchangeRateCNY: dto.exchangeRateCNY,
        quantity,
        returnRate,
        platformFeeRate,
        profitMarginRate,
        baseCost: calculated.baseCost,
        effectiveCost: calculated.effectiveCost,
        suggestedSellingPrice: calculated.suggestedSellingPrice,
        netProfit: calculated.netProfit,
        breakEvenPrice: calculated.breakEvenPrice,
        calculationData,
        notes: dto.notes,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    // Update variant's costCalculation in Product1688.variants JSON
    const updatedVariants = variants.map((v: any) => {
      if (v.sku === dto.variantSku) {
        return {
          ...v,
          costCalculation: {
            ...calculated,
            lastCalculatedAt: new Date().toISOString(),
          },
        };
      }
      return v;
    });

    await this.prisma.product1688.update({
      where: { id: dto.product1688Id },
      data: { variants: updatedVariants },
    });

    this.logger.log(
      `✅ Cost calculation saved for ${dto.variantSku}: ` +
        `Suggested price = ${calculated.suggestedSellingPrice} VND`,
    );

    return {
      success: true,
      calculation: history,
      result: calculated,
    };
  }

  /**
   * Get variant cost calculation history
   */
  async getVariantCostHistory(product1688Id: string, variantSku: string) {
    this.logger.log(`Fetching cost history for variant ${variantSku} of product ${product1688Id}`);

    // Verify product exists
    await this.findOne(product1688Id);

    const history = await this.prisma.product1688VariantCostHistory.findMany({
      where: {
        product1688Id,
        variantSku,
      },
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    return {
      product1688Id,
      variantSku,
      total: history.length,
      history,
    };
  }
}
