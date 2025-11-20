import { Injectable, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { Competitor } from './competitor.entity';
import { CompetitorProduct } from './competitor-product.entity';
import { CompetitorPromotion } from './competitor-promotion.entity';
import { Product } from '../products/product.entity';
import { CreateCompetitorDto } from './dto/create-competitor.dto';
import { UpdateCompetitorDto } from './dto/update-competitor.dto';

@Injectable()
export class CompetitorsService {
  constructor(
    @InjectRepository(Competitor)
    private competitorsRepository: Repository<Competitor>,
    @InjectRepository(CompetitorProduct)
    private competitorProductsRepository: Repository<CompetitorProduct>,
    @InjectRepository(CompetitorPromotion)
    private promotionsRepository: Repository<CompetitorPromotion>,
    @InjectRepository(Product)
    private productsRepository: Repository<Product>,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  async create(
    userId: string,
    organizationId: string | null,
    createDto: CreateCompetitorDto,
  ): Promise<Competitor> {
    const competitor = this.competitorsRepository.create({
      ...createDto,
      user: { id: userId } as any,
      organization: organizationId ? ({ id: organizationId } as any) : null,
    });

    return this.competitorsRepository.save(competitor);
  }

  async findAll(
    userId: string,
    organizationId: string | null,
  ): Promise<Competitor[]> {
    const where: any = { user: { id: userId } };
    if (organizationId) {
      where.organization = { id: organizationId };
    }

    return this.competitorsRepository.find({
      where,
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string, userId: string): Promise<Competitor> {
    const competitor = await this.competitorsRepository.findOne({
      where: { id, user: { id: userId } },
    });

    if (!competitor) {
      throw new Error(`Competitor with ID ${id} not found`);
    }

    return competitor;
  }

  async update(
    id: string,
    userId: string,
    updateDto: UpdateCompetitorDto,
  ): Promise<Competitor> {
    const competitor = await this.findOne(id, userId);
    Object.assign(competitor, updateDto);
    return this.competitorsRepository.save(competitor);
  }

  async remove(id: string, userId: string): Promise<void> {
    const competitor = await this.findOne(id, userId);
    await this.competitorsRepository.remove(competitor);
  }

  async trackProduct(
    competitorId: string,
    userId: string,
    productId: string,
    competitorProductData: {
      competitorProductId: string;
      competitorProductName: string;
      price: number;
      oldPrice?: number;
      rating?: number;
      reviewsCount?: number;
      salesCount?: number;
      position?: number;
      category?: string;
    },
  ): Promise<CompetitorProduct> {
    const competitor = await this.findOne(competitorId, userId);
    const product = await this.productsRepository.findOne({
      where: { id: productId },
    });

    if (!product) {
      throw new Error(`Product with ID ${productId} not found`);
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Проверяем, есть ли уже данные за сегодня
    const existing = await this.competitorProductsRepository.findOne({
      where: {
        competitor: { id: competitorId },
        product: { id: productId },
        date: today,
      },
    });

    if (existing) {
      Object.assign(existing, competitorProductData);
      return this.competitorProductsRepository.save(existing);
    }

    const competitorProduct = this.competitorProductsRepository.create({
      ...competitorProductData,
      competitor,
      product,
      date: today,
    });

    return this.competitorProductsRepository.save(competitorProduct);
  }

  async getCompetitorProducts(
    competitorId: string,
    userId: string,
    productId?: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<CompetitorProduct[]> {
    await this.findOne(competitorId, userId);

    const where: any = { competitor: { id: competitorId } };
    if (productId) {
      where.product = { id: productId };
    }

    if (startDate && endDate) {
      where.date = Between(startDate, endDate);
    }

    return this.competitorProductsRepository.find({
      where,
      relations: ['product'],
      order: { date: 'DESC', createdAt: 'DESC' },
    });
  }

  async comparePrices(
    userId: string,
    organizationId: string | null,
    productId: string,
  ): Promise<any> {
    const cacheKey = `price_comparison:${productId}`;
    const cached = await this.cacheManager.get<any>(cacheKey);
    if (cached) {
      return cached;
    }

    const product = await this.productsRepository.findOne({
      where: { id: productId },
    });

    if (!product) {
      throw new Error(`Product with ID ${productId} not found`);
    }

    const where: any = { user: { id: userId } };
    if (organizationId) {
      where.organization = { id: organizationId };
    }

    const competitors = await this.competitorsRepository.find({ where });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const comparisons = [];

    for (const competitor of competitors) {
      const competitorProduct = await this.competitorProductsRepository.findOne({
        where: {
          competitor: { id: competitor.id },
          product: { id: productId },
          date: today,
        },
        order: { createdAt: 'DESC' },
      });

      if (competitorProduct) {
        const priceDifference = competitorProduct.price - Number(product.price);
        const priceDifferencePercent =
          (priceDifference / Number(product.price)) * 100;

        comparisons.push({
          competitor: {
            id: competitor.id,
            name: competitor.name,
            marketplaceType: competitor.marketplaceType,
          },
          product: {
            id: competitorProduct.competitorProductId,
            name: competitorProduct.competitorProductName,
            price: competitorProduct.price,
            oldPrice: competitorProduct.oldPrice,
            rating: competitorProduct.rating,
            reviewsCount: competitorProduct.reviewsCount,
            position: competitorProduct.position,
          },
          comparison: {
            ourPrice: Number(product.price),
            competitorPrice: competitorProduct.price,
            difference: priceDifference,
            differencePercent: Math.round(priceDifferencePercent * 100) / 100,
            isCheaper: priceDifference < 0,
            isMoreExpensive: priceDifference > 0,
          },
        });
      }
    }

    const result = {
      ourProduct: {
        id: product.id,
        name: product.name,
        price: Number(product.price),
        sku: product.sku,
      },
      comparisons: comparisons.sort(
        (a, b) => a.comparison.competitorPrice - b.comparison.competitorPrice,
      ),
      summary: {
        totalCompetitors: comparisons.length,
        averagePrice:
          comparisons.length > 0
            ? comparisons.reduce(
                (sum, c) => sum + c.comparison.competitorPrice,
                0,
              ) / comparisons.length
            : 0,
        minPrice:
          comparisons.length > 0
            ? Math.min(...comparisons.map((c) => c.comparison.competitorPrice))
            : 0,
        maxPrice:
          comparisons.length > 0
            ? Math.max(...comparisons.map((c) => c.comparison.competitorPrice))
            : 0,
        cheaperCount: comparisons.filter((c) => c.comparison.isCheaper).length,
        moreExpensiveCount: comparisons.filter(
          (c) => c.comparison.isMoreExpensive,
        ).length,
      },
    };

    await this.cacheManager.set(cacheKey, result, 3600);
    return result;
  }

  async getCompetitorAnalytics(
    userId: string,
    organizationId: string | null,
    competitorId?: string,
  ): Promise<any> {
    const where: any = { user: { id: userId } };
    if (organizationId) {
      where.organization = { id: organizationId };
    }
    if (competitorId) {
      where.id = competitorId;
    }

    const competitors = await this.competitorsRepository.find({ where });

    const analytics = [];

    for (const competitor of competitors) {
      const products = await this.competitorProductsRepository.find({
        where: { competitor: { id: competitor.id } },
        order: { date: 'DESC' },
        take: 1000,
      });

      const uniqueProducts = new Set(
        products.map((p) => p.competitorProductId),
      ).size;

      const averagePrice =
        products.length > 0
          ? products.reduce((sum, p) => sum + Number(p.price), 0) /
            products.length
          : 0;

      const averageRating =
        products.filter((p) => p.rating).length > 0
          ? products
              .filter((p) => p.rating)
              .reduce((sum, p) => sum + (p.rating || 0), 0) /
            products.filter((p) => p.rating).length
          : 0;

      analytics.push({
        competitor: {
          id: competitor.id,
          name: competitor.name,
          marketplaceType: competitor.marketplaceType,
        },
        metrics: {
          trackedProducts: uniqueProducts,
          totalDataPoints: products.length,
          averagePrice: Math.round(averagePrice * 100) / 100,
          averageRating: Math.round(averageRating * 100) / 100,
          totalReviews: products.reduce(
            (sum, p) => sum + (p.reviewsCount || 0),
            0,
          ),
        },
      });
    }

    return analytics;
  }

  async trackPromotion(
    competitorId: string,
    userId: string,
    promotionData: {
      competitorProductId: string;
      productId?: string;
      type: string;
      title: string;
      description?: string;
      discountPercent?: number;
      startDate: Date;
      endDate?: Date;
    },
  ): Promise<CompetitorPromotion> {
    const competitor = await this.findOne(competitorId, userId);

    const promotion = this.promotionsRepository.create({
      ...promotionData,
      competitor,
      product: promotionData.productId
        ? ({ id: promotionData.productId } as any)
        : null,
      type: promotionData.type as any,
    });

    return this.promotionsRepository.save(promotion);
  }

  async getActivePromotions(
    userId: string,
    organizationId: string | null,
    competitorId?: string,
  ): Promise<CompetitorPromotion[]> {
    const where: any = {
      isActive: true,
      competitor: {
        user: { id: userId },
        ...(organizationId ? { organization: { id: organizationId } } : {}),
        ...(competitorId ? { id: competitorId } : {}),
      },
    };

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return this.promotionsRepository.find({
      where: [
        {
          ...where,
          startDate: Between(today, today),
        },
        {
          ...where,
          startDate: Between(today, today),
          endDate: null,
        },
      ],
      relations: ['competitor', 'product'],
      order: { startDate: 'DESC' },
    });
  }

  async findPriceGaps(
    userId: string,
    organizationId: string | null,
    threshold: number = 10,
  ): Promise<any> {
    const where: any = { user: { id: userId } };
    if (organizationId) {
      where.organization = { id: organizationId };
    }

    const products = await this.productsRepository.find({ where });
    const gaps = [];

    for (const product of products) {
      const comparison = await this.comparePrices(
        userId,
        organizationId,
        product.id,
      );

      if (comparison.comparisons.length > 0) {
        const ourPrice = Number(product.price);
        const minCompetitorPrice = comparison.summary.minPrice;

        if (minCompetitorPrice > 0) {
          const gap = ((ourPrice - minCompetitorPrice) / minCompetitorPrice) * 100;

          if (gap > threshold) {
            gaps.push({
              product: {
                id: product.id,
                name: product.name,
                sku: product.sku,
                ourPrice,
              },
              competitorPrice: minCompetitorPrice,
              gap: Math.round(gap * 100) / 100,
              opportunity: `Можем снизить цену на ${Math.round(gap)}% и остаться конкурентоспособными`,
            });
          }
        }
      }
    }

    return {
      gaps: gaps.sort((a, b) => b.gap - a.gap),
      summary: {
        totalGaps: gaps.length,
        averageGap:
          gaps.length > 0
            ? gaps.reduce((sum, g) => sum + g.gap, 0) / gaps.length
            : 0,
        maxGap: gaps.length > 0 ? Math.max(...gaps.map((g) => g.gap)) : 0,
      },
    };
  }
}

