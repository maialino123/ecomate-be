import { Injectable, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { PrismaService } from '@db/prisma.service';
import { Prisma } from '@prisma/client';
import {
  CreateProductDto,
  UpdateProductDto,
  QueryProductDto,
  ProductResponseDto,
  PaginatedProductsDto,
} from './dto/product.dto';

@Injectable()
export class ProductService {
  private readonly logger = new Logger(ProductService.name);

  constructor(private prisma: PrismaService) {}

  async create(dto: CreateProductDto, userId: string): Promise<ProductResponseDto> {
    // Check if SKU already exists
    const existingProduct = await this.prisma.product.findUnique({
      where: { sku: dto.sku },
    });

    if (existingProduct) {
      throw new ConflictException(`Product with SKU ${dto.sku} already exists`);
    }

    const product = await this.prisma.product.create({
      data: {
        ...dto,
        images: dto.images || [],
        tags: dto.tags || [],
        userId,
      },
      include: {
        supplier: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
    });

    this.logger.log(`Product created: ${product.sku}`);

    return this.mapToResponse(product);
  }

  async findAll(query: QueryProductDto, userId?: string): Promise<PaginatedProductsDto> {
    const {
      page = 1,
      limit = 10,
      search,
      category,
      brand,
      status,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = query;

    const where: Prisma.ProductWhereInput = {
      ...(userId && { userId }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { sku: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ],
      }),
      ...(category && { category: { equals: category, mode: 'insensitive' } }),
      ...(brand && { brand: { equals: brand, mode: 'insensitive' } }),
      ...(status && { status }),
    };

    const orderBy: Prisma.ProductOrderByWithRelationInput = {
      [sortBy]: sortOrder,
    };

    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          supplier: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
        },
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      data: products.map(this.mapToResponse),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string, userId?: string): Promise<ProductResponseDto> {
    const product = await this.prisma.product.findFirst({
      where: {
        id,
        ...(userId && { userId }),
      },
      include: {
        supplier: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        productSuppliers: {
          include: {
            supplier: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
          },
        },
        priceHistory: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }

    return this.mapToResponse(product);
  }

  async update(
    id: string,
    dto: UpdateProductDto,
    userId: string,
  ): Promise<ProductResponseDto> {
    const product = await this.prisma.product.findFirst({
      where: { id, userId },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }

    // Check if new SKU already exists
    if (dto.sku && dto.sku !== product.sku) {
      const existingProduct = await this.prisma.product.findUnique({
        where: { sku: dto.sku },
      });

      if (existingProduct) {
        throw new ConflictException(`Product with SKU ${dto.sku} already exists`);
      }
    }

    // Track price history if price changed
    const updates: any[] = [];
    if (dto.sellingPrice && dto.sellingPrice !== Number(product.sellingPrice)) {
      updates.push(
        this.prisma.priceHistory.create({
          data: {
            productId: id,
            oldPrice: product.sellingPrice,
            newPrice: dto.sellingPrice,
            reason: 'Manual update',
          },
        }),
      );
    }

    // Update product
    updates.push(
      this.prisma.product.update({
        where: { id },
        data: {
          ...dto,
          images: dto.images || (product.images as any),
          tags: dto.tags || product.tags,
        },
        include: {
          supplier: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
        },
      }),
    );

    const [, updatedProduct] = await this.prisma.$transaction(updates);

    this.logger.log(`Product updated: ${updatedProduct.sku}`);

    return this.mapToResponse(updatedProduct);
  }

  async delete(id: string, userId: string): Promise<void> {
    const product = await this.prisma.product.findFirst({
      where: { id, userId },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }

    await this.prisma.product.delete({
      where: { id },
    });

    this.logger.log(`Product deleted: ${product.sku}`);
  }

  async updateStock(
    id: string,
    quantity: number,
    userId: string,
  ): Promise<ProductResponseDto> {
    const product = await this.prisma.product.findFirst({
      where: { id, userId },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }

    const updatedProduct = await this.prisma.product.update({
      where: { id },
      data: {
        stock: quantity,
        status: quantity === 0 ? 'OUT_OF_STOCK' : product.status,
      },
      include: {
        supplier: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
    });

    this.logger.log(`Product stock updated: ${product.sku}, new stock: ${quantity}`);

    return this.mapToResponse(updatedProduct);
  }

  private mapToResponse(product: any): ProductResponseDto {
    return {
      id: product.id,
      sku: product.sku,
      name: product.name,
      description: product.description,
      category: product.category,
      brand: product.brand,
      basePrice: Number(product.basePrice),
      sellingPrice: Number(product.sellingPrice),
      currency: product.currency,
      stock: product.stock,
      minStock: product.minStock,
      unit: product.unit,
      mainImage: product.mainImage,
      images: product.images as string[],
      status: product.status,
      isActive: product.isActive,
      supplier: product.supplier,
      tags: product.tags as string[],
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
    };
  }
}