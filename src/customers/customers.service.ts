import { Injectable, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { CustomerSegment, SegmentType } from './customer-segment.entity';
import { CustomerSegmentMember } from './customer-segment-member.entity';
import { ProductSale } from '../products/product-sale.entity';
import { CreateSegmentDto } from './dto/create-segment.dto';
import { UpdateSegmentDto } from './dto/update-segment.dto';
import { AIService } from '../ai/ai.service';

@Injectable()
export class CustomersService {
  constructor(
    @InjectRepository(CustomerSegment)
    private segmentsRepository: Repository<CustomerSegment>,
    @InjectRepository(CustomerSegmentMember)
    private segmentMembersRepository: Repository<CustomerSegmentMember>,
    @InjectRepository(ProductSale)
    private salesRepository: Repository<ProductSale>,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private aiService: AIService,
  ) {}

  async createSegment(
    userId: string,
    organizationId: string | null,
    createDto: CreateSegmentDto,
  ): Promise<CustomerSegment> {
    const segment = this.segmentsRepository.create({
      ...createDto,
      user: { id: userId } as any,
      organization: organizationId ? ({ id: organizationId } as any) : null,
    });

    const saved = await this.segmentsRepository.save(segment);

    // Автоматически вычисляем клиентов сегмента
    await this.calculateSegmentMembers(saved.id, userId, organizationId);

    return saved;
  }

  async findAllSegments(
    userId: string,
    organizationId: string | null,
  ): Promise<CustomerSegment[]> {
    const where: any = { user: { id: userId } };
    if (organizationId) {
      where.organization = { id: organizationId };
    }

    return this.segmentsRepository.find({
      where,
      order: { createdAt: 'DESC' },
    });
  }

  async findOneSegment(id: string, userId: string): Promise<CustomerSegment> {
    const segment = await this.segmentsRepository.findOne({
      where: { id, user: { id: userId } },
    });

    if (!segment) {
      throw new Error(`Segment with ID ${id} not found`);
    }

    return segment;
  }

  async updateSegment(
    id: string,
    userId: string,
    updateDto: UpdateSegmentDto,
  ): Promise<CustomerSegment> {
    const segment = await this.findOneSegment(id, userId);
    Object.assign(segment, updateDto);

    const saved = await this.segmentsRepository.save(segment);

    // Пересчитываем клиентов, если изменились критерии
    if (updateDto.criteria) {
      await this.calculateSegmentMembers(saved.id, userId, null);
    }

    return saved;
  }

  async deleteSegment(id: string, userId: string): Promise<void> {
    const segment = await this.findOneSegment(id, userId);
    await this.segmentsRepository.remove(segment);
  }

  async calculateSegmentMembers(
    segmentId: string,
    userId: string,
    organizationId: string | null,
  ): Promise<void> {
    const segment = await this.segmentsRepository.findOne({
      where: { id: segmentId },
    });

    if (!segment) {
      return;
    }

    // Удаляем старых членов
    await this.segmentMembersRepository.delete({ segment: { id: segmentId } });

    // Получаем данные о продажах
    const sales = await this.salesRepository.find({
      where: {
        marketplaceAccount: {
          user: { id: userId },
          ...(organizationId ? { organization: { id: organizationId } } : {}),
        },
      },
      relations: ['product'],
      take: 10000,
    });

    // Группируем по клиентам
    const customerMap = new Map<string, any>();

    sales.forEach((sale) => {
      const customerId = sale.orderId || 'unknown';
      if (!customerMap.has(customerId)) {
        customerMap.set(customerId, {
          customerId,
          orders: [],
          totalRevenue: 0,
          totalProfit: 0,
          firstOrderDate: sale.saleDate,
          lastOrderDate: sale.saleDate,
          products: new Set(),
        });
      }

      const customer = customerMap.get(customerId);
      customer.orders.push(sale);
      customer.totalRevenue += Number(sale.totalAmount);
      customer.totalProfit += Number(sale.profit || 0);
      customer.products.add(sale.product?.id);

      if (sale.saleDate < customer.firstOrderDate) {
        customer.firstOrderDate = sale.saleDate;
      }
      if (sale.saleDate > customer.lastOrderDate) {
        customer.lastOrderDate = sale.saleDate;
      }
    });

    // Применяем критерии сегментации
    const matchingCustomers = Array.from(customerMap.values()).filter(
      (customer) => this.matchesCriteria(customer, segment.criteria),
    );

    // Сохраняем членов сегмента
    for (const customer of matchingCustomers) {
      const member = this.segmentMembersRepository.create({
        segment: { id: segmentId } as any,
        customerId: customer.customerId,
        customerData: {
          totalRevenue: customer.totalRevenue,
          totalProfit: customer.totalProfit,
          ordersCount: customer.orders.length,
          productsCount: customer.products.size,
          firstOrderDate: customer.firstOrderDate,
          lastOrderDate: customer.lastOrderDate,
        },
      });

      await this.segmentMembersRepository.save(member);
    }

    // Обновляем статистику сегмента
    const totalRevenue = matchingCustomers.reduce(
      (sum, c) => sum + c.totalRevenue,
      0,
    );
    const averageLTV =
      matchingCustomers.length > 0
        ? totalRevenue / matchingCustomers.length
        : 0;

    segment.customerCount = matchingCustomers.length;
    segment.totalRevenue = totalRevenue;
    segment.averageLTV = averageLTV;
    await this.segmentsRepository.save(segment);
  }

  private matchesCriteria(customer: any, criteria: any): boolean {
    if (!criteria) return true;

    // RFM сегментация
    if (criteria.rfm) {
      const now = new Date();
      const recencyDays =
        (now.getTime() - customer.lastOrderDate.getTime()) /
        (1000 * 60 * 60 * 24);
      const frequency = customer.orders.length;
      const monetary = customer.totalRevenue;

      if (criteria.rfm.recency) {
        if (
          criteria.rfm.recency.min !== undefined &&
          recencyDays < criteria.rfm.recency.min
        ) {
          return false;
        }
        if (
          criteria.rfm.recency.max !== undefined &&
          recencyDays > criteria.rfm.recency.max
        ) {
          return false;
        }
      }

      if (criteria.rfm.frequency) {
        if (
          criteria.rfm.frequency.min !== undefined &&
          frequency < criteria.rfm.frequency.min
        ) {
          return false;
        }
        if (
          criteria.rfm.frequency.max !== undefined &&
          frequency > criteria.rfm.frequency.max
        ) {
          return false;
        }
      }

      if (criteria.rfm.monetary) {
        if (
          criteria.rfm.monetary.min !== undefined &&
          monetary < criteria.rfm.monetary.min
        ) {
          return false;
        }
        if (
          criteria.rfm.monetary.max !== undefined &&
          monetary > criteria.rfm.monetary.max
        ) {
          return false;
        }
      }
    }

    // Поведенческие критерии
    if (criteria.behavioral) {
      if (
        criteria.behavioral.minOrders !== undefined &&
        customer.orders.length < criteria.behavioral.minOrders
      ) {
        return false;
      }
      if (
        criteria.behavioral.minRevenue !== undefined &&
        customer.totalRevenue < criteria.behavioral.minRevenue
      ) {
        return false;
      }
    }

    return true;
  }

  async getSegmentMembers(
    segmentId: string,
    userId: string,
    limit: number = 100,
  ): Promise<CustomerSegmentMember[]> {
    await this.findOneSegment(segmentId, userId);

    return this.segmentMembersRepository.find({
      where: { segment: { id: segmentId } },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  async getRepeatPurchaseAnalysis(
    userId: string,
    organizationId: string | null,
    days: number = 90,
  ): Promise<any> {
    const cacheKey = `repeat_purchase:${userId}:${organizationId || 'user'}:${days}`;
    const cached = await this.cacheManager.get<any>(cacheKey);
    if (cached) {
      return cached;
    }

    const sales = await this.salesRepository.find({
      where: {
        marketplaceAccount: {
          user: { id: userId },
          ...(organizationId ? { organization: { id: organizationId } } : {}),
        },
      },
      order: { saleDate: 'ASC' },
      take: 10000,
    });

    // Группируем по клиентам
    const customerMap = new Map<string, any>();

    sales.forEach((sale) => {
      const customerId = sale.orderId || 'unknown';
      if (!customerMap.has(customerId)) {
        customerMap.set(customerId, {
          customerId,
          orders: [],
          firstOrderDate: sale.saleDate,
          lastOrderDate: sale.saleDate,
        });
      }

      const customer = customerMap.get(customerId);
      customer.orders.push(sale);
      if (sale.saleDate < customer.firstOrderDate) {
        customer.firstOrderDate = sale.saleDate;
      }
      if (sale.saleDate > customer.lastOrderDate) {
        customer.lastOrderDate = sale.saleDate;
      }
    });

    const now = new Date();
    const cutoffDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    const analysis = {
      totalCustomers: customerMap.size,
      oneTimeCustomers: 0,
      repeatCustomers: 0,
      repeatRate: 0,
      averageOrdersPerCustomer: 0,
      repeatPurchaseRate: 0, // Процент клиентов с повторными покупками
      customersByOrderCount: {} as Record<number, number>,
    };

    let totalOrders = 0;
    let repeatCustomersCount = 0;

    customerMap.forEach((customer) => {
      const ordersCount = customer.orders.length;
      totalOrders += ordersCount;

      if (ordersCount === 1) {
        analysis.oneTimeCustomers++;
      } else {
        analysis.repeatCustomers++;
        repeatCustomersCount++;

        // Проверяем повторные покупки за период
        const repeatOrders = customer.orders.filter(
          (o: any) => o.saleDate >= cutoffDate && o.saleDate !== customer.firstOrderDate,
        );
        if (repeatOrders.length > 0) {
          analysis.repeatPurchaseRate++;
        }
      }

      analysis.customersByOrderCount[ordersCount] =
        (analysis.customersByOrderCount[ordersCount] || 0) + 1;
    });

    analysis.averageOrdersPerCustomer =
      customerMap.size > 0 ? totalOrders / customerMap.size : 0;
    analysis.repeatRate =
      customerMap.size > 0
        ? (analysis.repeatCustomers / customerMap.size) * 100
        : 0;
    analysis.repeatPurchaseRate =
      customerMap.size > 0
        ? (analysis.repeatPurchaseRate / customerMap.size) * 100
        : 0;

    await this.cacheManager.set(cacheKey, analysis, 3600);
    return analysis;
  }

  async getSalesFunnel(
    userId: string,
    organizationId: string | null,
    startDate?: Date,
    endDate?: Date,
  ): Promise<any> {
    const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate || new Date();

    const sales = await this.salesRepository.find({
      where: {
        marketplaceAccount: {
          user: { id: userId },
          ...(organizationId ? { organization: { id: organizationId } } : {}),
        },
        saleDate: Between(start, end),
      },
      relations: ['product'],
    });

    // Группируем по клиентам
    const customerMap = new Map<string, any>();

    sales.forEach((sale) => {
      const customerId = sale.orderId || 'unknown';
      if (!customerMap.has(customerId)) {
        customerMap.set(customerId, {
          customerId,
          orders: [],
          totalRevenue: 0,
        });
      }

      const customer = customerMap.get(customerId);
      customer.orders.push(sale);
      customer.totalRevenue += Number(sale.totalAmount);
    });

    // Строим воронку
    const funnel = {
      visitors: customerMap.size, // Все уникальные клиенты
      interested: 0, // Клиенты с просмотрами (не можем отследить, используем всех)
      addedToCart: 0, // Клиенты с товарами в корзине (не можем отследить)
      checkout: customerMap.size, // Клиенты, дошедшие до оформления
      purchased: customerMap.size, // Клиенты, совершившие покупку
      repeatPurchased: 0, // Клиенты с повторными покупками
    };

    customerMap.forEach((customer) => {
      if (customer.orders.length > 1) {
        funnel.repeatPurchased++;
      }
    });

    // Вычисляем конверсии
    const conversions = {
      interestToCart: 0, // Нет данных
      cartToCheckout: 0, // Нет данных
      checkoutToPurchase: 100, // Все дошедшие до чека купили
      purchaseToRepeat: funnel.purchased > 0
        ? (funnel.repeatPurchased / funnel.purchased) * 100
        : 0,
    };

    return {
      funnel,
      conversions,
      summary: {
        totalCustomers: customerMap.size,
        totalRevenue: Array.from(customerMap.values()).reduce(
          (sum, c) => sum + c.totalRevenue,
          0,
        ),
        averageOrderValue:
          sales.length > 0
            ? sales.reduce((sum, s) => sum + Number(s.totalAmount), 0) /
              sales.length
            : 0,
      },
    };
  }

  async getPersonalizedRecommendations(
    userId: string,
    organizationId: string | null,
    customerId: string,
  ): Promise<any> {
    // Получаем данные о клиенте
    const sales = await this.salesRepository.find({
      where: {
        marketplaceAccount: {
          user: { id: userId },
          ...(organizationId ? { organization: { id: organizationId } } : {}),
        },
        orderId: customerId,
      },
      relations: ['product', 'product.category'],
    });

    if (sales.length === 0) {
      return { recommendations: [], message: 'Клиент не найден' };
    }

    // Анализируем покупки клиента
    const purchasedProducts = new Set<string>();
    const categories = new Map<string, number>();

    sales.forEach((sale) => {
      if (sale.product?.id) {
        purchasedProducts.add(sale.product.id);
      }
      if (sale.product?.category) {
        const category = sale.product.category.name || 'Без категории';
        categories.set(
          category,
          (categories.get(category) || 0) + Number(sale.totalAmount),
        );
      }
    });

    // Получаем все товары пользователя
    const allProducts = await this.salesRepository
      .createQueryBuilder('sale')
      .leftJoinAndSelect('sale.product', 'product')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoin('sale.marketplaceAccount', 'account')
      .where('account.user.id = :userId', { userId })
      .andWhere(
        organizationId
          ? 'account.organization.id = :organizationId'
          : '1=1',
        organizationId ? { organizationId } : {},
      )
      .getMany();

    // Рекомендуем товары из тех же категорий, которые клиент еще не покупал
    const topCategory = Array.from(categories.entries()).sort(
      (a, b) => b[1] - a[1],
    )[0]?.[0];

    const recommendations = allProducts
      .filter((sale) => {
        const productId = sale.product?.id;
        return (
          productId &&
          !purchasedProducts.has(productId) &&
          sale.product?.category?.name === topCategory
        );
      })
      .slice(0, 10)
      .map((sale) => ({
        product: {
          id: sale.product?.id,
          name: sale.product?.name,
          price: sale.product?.price,
          image: sale.product?.images?.[0] || null,
        },
        reason: `Похож на товары, которые вы уже покупали`,
        confidence: 75,
      }));

    return {
      customerId,
      purchasedProductsCount: purchasedProducts.size,
      topCategory,
      recommendations,
    };
  }
}

