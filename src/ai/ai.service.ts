import { Injectable, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { AITask, AITaskType, AITaskStatus } from './ai-task.entity';
import { AIRecommendation, RecommendationType } from './ai-recommendation.entity';
import { ProductsService } from '../products/products.service';
import { ProductSale } from '../products/product-sale.entity';
import { AIClientService } from './ai-client.service';
import { IntegrationsService } from '../integrations/integrations.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { Product } from '../products/product.entity';

export interface DemandForecast {
  productId: string;
  productName: string;
  forecast: Array<{
    date: Date;
    predictedQuantity: number;
    confidence: number;
  }>;
  seasonalityFactor?: number;
  trend?: 'increasing' | 'decreasing' | 'stable';
}

export interface PriceRecommendation {
  productId: string;
  productName: string;
  currentPrice: number;
  recommendedPrice: number;
  minPrice: number;
  maxPrice: number;
  confidence: number;
  reasoning: string;
}

export interface AnomalyDetection {
  productId?: string;
  type: 'sales_spike' | 'sales_drop' | 'price_anomaly' | 'stock_anomaly';
  severity: 'low' | 'medium' | 'high';
  description: string;
  detectedAt: Date;
  data: any;
}

@Injectable()
export class AIService {
  constructor(
    @InjectRepository(AITask)
    private aiTasksRepository: Repository<AITask>,
    @InjectRepository(AIRecommendation)
    private recommendationsRepository: Repository<AIRecommendation>,
    @InjectRepository(ProductSale)
    private salesRepository: Repository<ProductSale>,
    @InjectQueue('ai')
    private aiQueue: Queue,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private productsService: ProductsService,
    private integrationsService: IntegrationsService,
    private aiClient: AIClientService,
  ) {}

  async createAITask(
    userId: string,
    organizationId: string | null,
    type: AITaskType,
    inputParams: any,
    productId?: string,
  ): Promise<AITask> {
    const task = this.aiTasksRepository.create({
      user: { id: userId } as any,
      organization: organizationId ? ({ id: organizationId } as any) : null,
      type,
      inputParams,
      product: productId ? ({ id: productId } as any) : null,
      status: AITaskStatus.PENDING,
    });

    const savedTask = await this.aiTasksRepository.save(task);

    // Добавляем задачу в очередь
    await this.aiQueue.add('process-ai-task', {
      taskId: savedTask.id,
      type,
      inputParams,
      productId,
      userId,
      organizationId,
    });

    return savedTask;
  }

  async getDemandForecast(
    userId: string,
    organizationId: string | null,
    productId: string,
    days: number = 30,
  ): Promise<DemandForecast> {
    const cacheKey = `demand_forecast:${productId}:${days}`;
    
    const cached = await this.cacheManager.get<DemandForecast>(cacheKey);
    if (cached) {
      return cached;
    }

    // Получаем исторические данные о продажах
    const product = await this.productsService.findOne(productId, userId);
    const sales = await this.salesRepository.find({
      where: { product: { id: productId } },
      order: { saleDate: 'ASC' },
      take: 1000,
    });

    if (sales.length < 7) {
      throw new Error('Недостаточно данных для прогноза');
    }

    // Пытаемся использовать AI микросервис
    let forecast: any;
    let trend: 'increasing' | 'decreasing' | 'stable' = 'stable';

    try {
      // Подготавливаем данные для AI сервиса
      const salesData = sales.map((sale) => ({
        date: sale.saleDate.toISOString().split('T')[0],
        quantity: sale.quantity,
      }));

      const aiResult = await this.aiClient.forecastDemand(salesData, days);

      // Преобразуем результат AI сервиса
      forecast = aiResult.forecast.map((f: any) => ({
        date: new Date(f.date),
        predictedQuantity: f.predicted_quantity,
        confidence: f.confidence,
      }));

      trend = aiResult.trend as 'increasing' | 'decreasing' | 'stable';
    } catch (error) {
      // Fallback на простой алгоритм если AI сервис недоступен
      console.warn('AI service unavailable, using fallback:', error);
      forecast = this.calculateSimpleForecast(sales, days);
      trend = this.detectTrend(sales);
    }

    const result: DemandForecast = {
      productId,
      productName: product.name,
      forecast,
      trend,
    };

    await this.cacheManager.set(cacheKey, result, 3600);
    return result;
  }

  async getPriceRecommendation(
    userId: string,
    organizationId: string | null,
    productId: string,
  ): Promise<PriceRecommendation> {
    const cacheKey = `price_recommendation:${productId}`;
    
    const cached = await this.cacheManager.get<PriceRecommendation>(cacheKey);
    if (cached) {
      return cached;
    }

    const product = await this.productsService.findOne(productId, userId);
    const sales = await this.salesRepository.find({
      where: { product: { id: productId } },
      order: { saleDate: 'DESC' },
      take: 100,
    });

    // Пытаемся использовать AI микросервис
    let recommendation: PriceRecommendation;

    try {
      const salesHistory = sales.map((sale) => ({
        price: Number(sale.product?.price || sale.totalAmount / sale.quantity),
        quantity: sale.quantity,
      }));

      const aiResult = await this.aiClient.recommendPrice(
        { price: product.price },
        salesHistory,
      );

      recommendation = {
        productId,
        productName: product.name,
        currentPrice: product.price,
        recommendedPrice: aiResult.recommended_price,
        minPrice: aiResult.min_price,
        maxPrice: aiResult.max_price,
        confidence: aiResult.confidence,
        reasoning: aiResult.reasoning,
      };
    } catch (error) {
      // Fallback на простой алгоритм
      console.warn('AI service unavailable, using fallback:', error);
      recommendation = this.calculatePriceRecommendation(product, sales);
    }

    await this.cacheManager.set(cacheKey, recommendation, 3600);
    return recommendation;
  }

  async detectAnomalies(
    userId: string,
    organizationId: string | null,
    startDate?: Date,
    endDate?: Date,
  ): Promise<AnomalyDetection[]> {
    const start = startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const end = endDate || new Date();

    // Получаем продажи за период
    const sales = await this.salesRepository.find({
      where: {
        saleDate: Between(start, end),
        marketplaceAccount: {
          user: { id: userId },
          ...(organizationId ? { organization: { id: organizationId } } : {}),
        },
      },
      relations: ['product'],
      order: { saleDate: 'DESC' },
    });

    // Группируем по товарам и дням
    const salesByProductAndDate = new Map<string, Map<string, number>>();

    sales.forEach((sale) => {
      const productId = sale.product.id;
      const dateKey = sale.saleDate.toISOString().split('T')[0];

      if (!salesByProductAndDate.has(productId)) {
        salesByProductAndDate.set(productId, new Map());
      }

      const productMap = salesByProductAndDate.get(productId);
      const current = productMap.get(dateKey) || 0;
      productMap.set(dateKey, current + sale.quantity);
    });

    let anomalies: AnomalyDetection[] = [];

    try {
      // Подготавливаем данные для AI сервиса
      const salesData = sales.map((sale) => ({
        date: sale.saleDate.toISOString().split('T')[0],
        quantity: sale.quantity,
        revenue: Number(sale.totalAmount),
      }));

      const aiResult = await this.aiClient.detectAnomalies(salesData, 2.0);

      // Преобразуем результат AI сервиса
      anomalies = aiResult.anomalies.map((anomaly: any) => {
        const sale = sales[anomaly.index];
        return {
          productId: sale?.product?.id,
          type: anomaly.type === 'sales_anomaly' ? 'sales_spike' : 'sales_drop',
          severity: anomaly.severity || 'medium',
          description: `Аномалия обнаружена AI моделью`,
          detectedAt: new Date(anomaly.date),
          data: anomaly.data,
        };
      });
    } catch (error) {
      // Fallback на простой алгоритм (z-score)
      console.warn('AI service unavailable, using fallback:', error);
      
      // Обнаружение аномалий
      for (const [productId, dateMap] of salesByProductAndDate.entries()) {
      const values = Array.from(dateMap.values());
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const stdDev = Math.sqrt(
        values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) /
          values.length,
      );

      for (const [date, quantity] of dateMap.entries()) {
        const zScore = (quantity - mean) / (stdDev || 1);

        if (Math.abs(zScore) > 2) {
          const product = sales.find((s) => s.product.id === productId)?.product;
          anomalies.push({
            productId,
            type: zScore > 2 ? 'sales_spike' : 'sales_drop',
            severity: Math.abs(zScore) > 3 ? 'high' : 'medium',
            description: `Аномалия продаж: ${zScore > 2 ? 'всплеск' : 'падение'} на ${Math.abs(zScore).toFixed(1)}σ`,
            detectedAt: new Date(date),
            data: {
              expected: mean,
              actual: quantity,
              deviation: zScore,
              productName: product?.name,
            },
          });
        }
      }
      }
    }

    return anomalies.sort((a, b) => {
      const severityOrder = { high: 3, medium: 2, low: 1 };
      return severityOrder[b.severity] - severityOrder[a.severity];
    });
  }

  async getAssortmentRecommendations(
    userId: string,
    organizationId: string | null,
  ): Promise<any[]> {
    // Анализ популярных товаров и категорий
    const topProducts = await this.productsService.getTopProducts(
      userId,
      organizationId,
      50,
      'revenue',
    );

    // Группируем по категориям
    const categoryMap = new Map<string, any>();

    topProducts.forEach((product) => {
      const category = product.category?.name || 'Без категории';
      if (!categoryMap.has(category)) {
        categoryMap.set(category, {
          category,
          products: [],
          totalRevenue: 0,
          avgPrice: 0,
        });
      }

      const cat = categoryMap.get(category);
      cat.products.push(product);
      cat.totalRevenue += Number(product.totalRevenue);
    });

    // Вычисляем среднюю цену
    const recommendations = Array.from(categoryMap.values()).map((cat) => {
      cat.avgPrice =
        cat.products.length > 0
          ? cat.products.reduce(
              (sum: number, p: any) => sum + Number(p.price),
              0,
            ) / cat.products.length
          : 0;
      return cat;
    });

    return recommendations
      .sort((a, b) => b.totalRevenue - a.totalRevenue)
      .slice(0, 10);
  }

  async getCustomerSegmentation(
    userId: string,
    organizationId: string | null,
  ): Promise<any> {
    // Пытаемся использовать AI микросервис для сегментации
    const sales = await this.salesRepository.find({
      where: {
        marketplaceAccount: {
          user: { id: userId },
          ...(organizationId ? { organization: { id: organizationId } } : {}),
        },
      },
      relations: ['product'],
      take: 1000,
    });

    try {
      // Группируем по клиентам
      const customerMap = new Map<string, any>();
      sales.forEach((sale) => {
        const customerId = sale.orderId || 'unknown';
        if (!customerMap.has(customerId)) {
          customerMap.set(customerId, {
            customer_id: customerId,
            total_revenue: 0,
            orders_count: 0,
            products_count: 0,
            avg_order_value: 0,
          });
        }

        const customer = customerMap.get(customerId);
        customer.total_revenue += Number(sale.totalAmount);
        customer.orders_count += 1;
        customer.products_count += 1;
      });

      // Вычисляем средний чек
      customerMap.forEach((customer) => {
        customer.avg_order_value = customer.total_revenue / customer.orders_count;
      });

      const customerData = Array.from(customerMap.values());

      if (customerData.length >= 5) {
        const aiResult = await this.aiClient.segmentCustomers(customerData, 5);
        return {
          segments: aiResult.segments,
          clusterCenters: aiResult.cluster_centers,
          totalCustomers: customerData.length,
        };
      }
    } catch (error) {
      console.warn('AI service unavailable for segmentation, using fallback:', error);
    }

    // Fallback на простую сегментацию по регионам
    const segments = new Map<string, any>();

    sales.forEach((sale) => {
      const segment = sale.region || 'Не указан';
      if (!segments.has(segment)) {
        segments.set(segment, {
          name: segment,
          ordersCount: 0,
          totalRevenue: 0,
          averageOrderValue: 0,
          customers: new Set(),
        });
      }

      const seg = segments.get(segment);
      seg.ordersCount += 1;
      seg.totalRevenue += Number(sale.totalAmount);
      if (sale.orderId) {
        seg.customers.add(sale.orderId);
      }
    });

    // Вычисляем метрики
    const result = Array.from(segments.values()).map((seg) => {
      seg.customerCount = seg.customers.size;
      seg.averageOrderValue =
        seg.ordersCount > 0 ? seg.totalRevenue / seg.ordersCount : 0;
      delete seg.customers;
      return seg;
    });

    return {
      segments: result.sort((a, b) => b.totalRevenue - a.totalRevenue),
      totalSegments: result.length,
    };
  }

  async calculateLTV(
    userId: string,
    organizationId: string | null,
  ): Promise<any> {
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

    // Группируем по заказам (как клиентам)
    const customerMap = new Map<string, any>();

    sales.forEach((sale) => {
      const customerId = sale.orderId || 'unknown';
      if (!customerMap.has(customerId)) {
        customerMap.set(customerId, {
          customerId,
          ordersCount: 0,
          totalRevenue: 0,
          totalProfit: 0,
          firstOrderDate: sale.saleDate,
          lastOrderDate: sale.saleDate,
          products: new Set(),
        });
      }

      const customer = customerMap.get(customerId);
      customer.ordersCount += 1;
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

    // Вычисляем LTV для каждого клиента
    const customers = Array.from(customerMap.values()).map((customer) => {
      const daysSinceFirstOrder =
        (new Date().getTime() - customer.firstOrderDate.getTime()) /
        (1000 * 60 * 60 * 24);
      const averageOrderValue =
        customer.ordersCount > 0
          ? customer.totalRevenue / customer.ordersCount
          : 0;

      // Упрощенный расчет LTV: средний чек * среднее количество заказов в месяц * средний срок жизни клиента (в месяцах)
      const ordersPerMonth =
        daysSinceFirstOrder > 0
          ? (customer.ordersCount / daysSinceFirstOrder) * 30
          : customer.ordersCount;
      const customerLifetimeMonths = Math.max(1, daysSinceFirstOrder / 30);
      const ltv = averageOrderValue * ordersPerMonth * customerLifetimeMonths;

      return {
        ...customer,
        productsCount: customer.products.size,
        averageOrderValue,
        ordersPerMonth: Math.round(ordersPerMonth * 100) / 100,
        customerLifetimeMonths: Math.round(customerLifetimeMonths * 100) / 100,
        ltv: Math.round(ltv * 100) / 100,
        daysSinceFirstOrder: Math.round(daysSinceFirstOrder),
      };
    });

    const averageLTV =
      customers.reduce((sum, c) => sum + c.ltv, 0) / customers.length;

    return {
      customers: customers.sort((a, b) => b.ltv - a.ltv),
      averageLTV: Math.round(averageLTV * 100) / 100,
      totalCustomers: customers.length,
      summary: {
        highValueCustomers: customers.filter((c) => c.ltv > averageLTV * 1.5)
          .length,
        mediumValueCustomers: customers.filter(
          (c) => c.ltv <= averageLTV * 1.5 && c.ltv >= averageLTV * 0.5,
        ).length,
        lowValueCustomers: customers.filter((c) => c.ltv < averageLTV * 0.5)
          .length,
      },
    };
  }

  async predictChurn(
    userId: string,
    organizationId: string | null,
  ): Promise<any> {
    const sales = await this.salesRepository.find({
      where: {
        marketplaceAccount: {
          user: { id: userId },
          ...(organizationId ? { organization: { id: organizationId } } : {}),
        },
      },
      relations: ['product'],
      order: { saleDate: 'DESC' },
      take: 10000,
    });

    // Группируем по заказам (клиентам)
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

    const now = new Date();
    const churnThresholdDays = 60; // Если клиент не делал заказ 60 дней - риск оттока

    const churnPredictions = Array.from(customerMap.values())
      .map((customer) => {
        const lastOrderDate = customer.orders[0]?.saleDate || now;
        const daysSinceLastOrder =
          (now.getTime() - lastOrderDate.getTime()) / (1000 * 60 * 60 * 24);
        const ordersCount = customer.orders.length;
        const averageOrderValue =
          ordersCount > 0 ? customer.totalRevenue / ordersCount : 0;

        // Простая модель прогноза оттока
        let churnRisk = 0;
        if (daysSinceLastOrder > churnThresholdDays) {
          churnRisk = Math.min(100, (daysSinceLastOrder / churnThresholdDays) * 50);
        }

        // Учитываем частоту заказов
        if (ordersCount === 1 && daysSinceLastOrder > 30) {
          churnRisk += 30; // Одноразовые клиенты с давним заказом
        }

        return {
          customerId: customer.customerId,
          lastOrderDate,
          daysSinceLastOrder: Math.round(daysSinceLastOrder),
          ordersCount,
          averageOrderValue: Math.round(averageOrderValue * 100) / 100,
          totalRevenue: Math.round(customer.totalRevenue * 100) / 100,
          churnRisk: Math.min(100, Math.round(churnRisk)),
          riskLevel:
            churnRisk > 70
              ? 'high'
              : churnRisk > 40
              ? 'medium'
              : 'low',
        };
      })
      .filter((c) => c.churnRisk > 0)
      .sort((a, b) => b.churnRisk - a.churnRisk);

    return {
      predictions: churnPredictions,
      summary: {
        totalCustomers: customerMap.size,
        atRisk: churnPredictions.length,
        highRisk: churnPredictions.filter((c) => c.riskLevel === 'high').length,
        mediumRisk: churnPredictions.filter((c) => c.riskLevel === 'medium')
          .length,
        lowRisk: churnPredictions.filter((c) => c.riskLevel === 'low').length,
      },
    };
  }

  async getRetentionRecommendations(
    userId: string,
    organizationId: string | null,
  ): Promise<any> {
    const churnData = await this.predictChurn(userId, organizationId);
    const ltvData = await this.calculateLTV(userId, organizationId);

    const recommendations = [];

    // Рекомендации для клиентов с высоким риском оттока
    const highRiskCustomers = churnData.predictions.filter(
      (c) => c.riskLevel === 'high',
    );

    if (highRiskCustomers.length > 0) {
      const avgLTV = ltvData.averageLTV;
      const highValueAtRisk = highRiskCustomers.filter(
        (c) => c.totalRevenue > avgLTV,
      );

      if (highValueAtRisk.length > 0) {
        recommendations.push({
          type: 'personalized_offer',
          priority: 'high',
          title: 'Персонализированные предложения для VIP клиентов',
          description: `Рекомендуется отправить специальные предложения ${highValueAtRisk.length} VIP клиентам с высоким риском оттока`,
          customers: highValueAtRisk.slice(0, 10),
          estimatedImpact: `Потенциальная потеря LTV: ${highValueAtRisk.reduce(
            (sum, c) => sum + c.totalRevenue,
            0,
          ).toFixed(0)} ₽`,
        });
      }

      recommendations.push({
        type: 'reactivation_campaign',
        priority: 'medium',
        title: 'Кампания по реактивации',
        description: `Рекомендуется запустить кампанию по реактивации для ${highRiskCustomers.length} клиентов`,
        customersCount: highRiskCustomers.length,
        estimatedImpact: `Потенциальная экономия: ${highRiskCustomers.reduce(
          (sum, c) => sum + c.totalRevenue,
          0,
        ).toFixed(0)} ₽`,
      });
    }

    // Рекомендации на основе LTV
    const lowLTVCustomers = ltvData.customers.filter(
      (c) => c.ltv < ltvData.averageLTV * 0.5,
    );

    if (lowLTVCustomers.length > 0) {
      recommendations.push({
        type: 'upsell_campaign',
        priority: 'low',
        title: 'Кампания по увеличению среднего чека',
        description: `Рекомендуется запустить кампанию по увеличению среднего чека для ${lowLTVCustomers.length} клиентов с низким LTV`,
        customersCount: lowLTVCustomers.length,
        estimatedImpact: `Потенциальное увеличение LTV: ${(
          lowLTVCustomers.length * ltvData.averageLTV * 0.3
        ).toFixed(0)} ₽`,
      });
    }

    return {
      recommendations,
      summary: {
        totalRecommendations: recommendations.length,
        highPriority: recommendations.filter((r) => r.priority === 'high').length,
        estimatedTotalImpact: recommendations.reduce(
          (sum, r) => sum + (parseFloat(r.estimatedImpact?.match(/\d+/)?.[0] || '0') || 0),
          0,
        ),
      },
    };
  }

  async saveRecommendation(
    userId: string,
    organizationId: string | null,
    type: RecommendationType,
    title: string,
    description: string,
    data: any,
    productId?: string,
    confidence?: number,
  ): Promise<AIRecommendation> {
    const recommendation = this.recommendationsRepository.create({
      user: { id: userId } as any,
      organization: organizationId ? ({ id: organizationId } as any) : null,
      product: productId ? ({ id: productId } as any) : null,
      type,
      title,
      description,
      data,
      confidence: confidence || 0,
    });

    return this.recommendationsRepository.save(recommendation);
  }

  async getRecommendations(
    userId: string,
    organizationId: string | null,
    type?: RecommendationType,
    limit: number = 50,
  ): Promise<AIRecommendation[]> {
    const where: any = { user: { id: userId } };
    if (organizationId) {
      where.organization = { id: organizationId };
    }
    if (type) {
      where.type = type;
    }

    return this.recommendationsRepository.find({
      where,
      relations: ['product'],
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  async applyRecommendation(
    recommendationId: string,
    userId: string,
  ): Promise<{ success: boolean; message: string; data?: any }> {
    // Получаем рекомендацию
    const recommendation = await this.recommendationsRepository.findOne({
      where: { id: recommendationId, user: { id: userId } },
      relations: ['product'],
    });

    if (!recommendation) {
      throw new NotFoundException('Рекомендация не найдена');
    }

    // Проверяем, не применена ли уже
    if (recommendation.isApplied) {
      throw new BadRequestException('Рекомендация уже применена');
    }

    // Применяем в зависимости от типа
    let result: { success: boolean; message: string; data?: any };

    try {
      switch (recommendation.type) {
        case RecommendationType.PRICE:
          result = await this.applyPriceRecommendation(recommendation, userId);
          break;
        case RecommendationType.DEMAND:
          result = await this.applyDemandRecommendation(recommendation, userId);
          break;
        case RecommendationType.ASSORTMENT:
          result = await this.applyAssortmentRecommendation(recommendation, userId);
          break;
        case RecommendationType.ANOMALY:
          result = await this.applyAnomalyRecommendation(recommendation, userId);
          break;
        case RecommendationType.CUSTOMER:
          result = await this.applyCustomerRecommendation(recommendation, userId);
          break;
        default:
          throw new BadRequestException(`Неизвестный тип рекомендации: ${recommendation.type}`);
      }

      // Помечаем как примененную
      recommendation.isApplied = true;
      recommendation.metadata = {
        ...recommendation.metadata,
        appliedAt: new Date(),
        appliedBy: userId,
        result,
      };
      await this.recommendationsRepository.save(recommendation);

      return result;
    } catch (error) {
      // Сохраняем ошибку в метаданных
      recommendation.metadata = {
        ...recommendation.metadata,
        applyError: error.message,
        applyAttemptedAt: new Date(),
      };
      await this.recommendationsRepository.save(recommendation);
      throw error;
    }
  }

  private async applyPriceRecommendation(
    recommendation: AIRecommendation,
    userId: string,
  ): Promise<{ success: boolean; message: string; data?: any }> {
    if (!recommendation.product) {
      throw new BadRequestException('Рекомендация по цене должна быть связана с товаром');
    }

    const data = recommendation.data as PriceRecommendation;
    const recommendedPrice = data.recommendedPrice || data.currentPrice;

    if (!recommendedPrice || recommendedPrice <= 0) {
      throw new BadRequestException('Некорректная рекомендуемая цена');
    }

    // Получаем товар
    const product = await this.productsService.findOne(
      recommendation.product.id,
      userId,
    );

    // Обновляем цену только в БД (для MVP - без обновления на маркетплейсах)
    await this.productsService.update(recommendation.product.id, userId, {
      price: recommendedPrice,
    } as any);

    return {
      success: true,
      message: `Цена товара "${product.name}" обновлена в системе на ${recommendedPrice} руб. Для применения на маркетплейсах обновите цену вручную в личном кабинете маркетплейса.`,
      data: {
        productId: product.id,
        oldPrice: product.price,
        newPrice: recommendedPrice,
        note: 'Цена обновлена только в системе. Для применения на маркетплейсах требуется ручное обновление.',
      },
    };
  }

  private async applyDemandRecommendation(
    recommendation: AIRecommendation,
    userId: string,
  ): Promise<{ success: boolean; message: string; data?: any }> {
    const data = recommendation.data as DemandForecast;

    // Сохраняем прогноз в метаданных товара
    if (recommendation.product) {
      const product = await this.productsService.findOne(
        recommendation.product.id,
        userId,
      );

      // Обновляем метаданные товара с прогнозом
      const metadata = product.metadata || {};
      metadata.demandForecast = {
        ...data,
        appliedAt: new Date(),
        recommendationId: recommendation.id,
      };

      await this.productsService.update(recommendation.product.id, userId, {
        metadata,
      } as any);

      return {
        success: true,
        message: `Прогноз спроса для товара "${product.name}" сохранен`,
        data: {
          productId: product.id,
          forecast: data.forecast,
        },
      };
    }

    return {
      success: true,
      message: 'Прогноз спроса сохранен',
      data: {
        forecast: data.forecast,
      },
    };
  }

  private async applyAssortmentRecommendation(
    recommendation: AIRecommendation,
    userId: string,
  ): Promise<{ success: boolean; message: string; data?: any }> {
    const data = recommendation.data;

    // Сохраняем рекомендации по ассортименту
    // Это может быть список товаров для добавления или категорий для расширения
    return {
      success: true,
      message: 'Рекомендации по ассортименту сохранены',
      data: {
        recommendations: data,
      },
    };
  }

  private async applyAnomalyRecommendation(
    recommendation: AIRecommendation,
    userId: string,
  ): Promise<{ success: boolean; message: string; data?: any }> {
    const data = recommendation.data as AnomalyDetection;

    // Создаем уведомление об аномалии
    // В реальной системе здесь можно создать уведомление через NotificationsService
    return {
      success: true,
      message: `Аномалия "${data.description}" зафиксирована`,
      data: {
        anomalyType: data.type,
        severity: data.severity,
        description: data.description,
        detectedAt: data.detectedAt,
      },
    };
  }

  private async applyCustomerRecommendation(
    recommendation: AIRecommendation,
    userId: string,
  ): Promise<{ success: boolean; message: string; data?: any }> {
    const data = recommendation.data;

    // Применяем рекомендации по клиентам
    // Это может быть сегментация, персонализация и т.д.
    return {
      success: true,
      message: 'Рекомендации по клиентам применены',
      data: {
        recommendations: data,
      },
    };
  }

  // Вспомогательные методы
  private calculateSimpleForecast(
    sales: ProductSale[],
    days: number,
  ): Array<{ date: Date; predictedQuantity: number; confidence: number }> {
    // Группируем по дням
    const dailySales = new Map<string, number>();
    sales.forEach((sale) => {
      const dateKey = sale.saleDate.toISOString().split('T')[0];
      const current = dailySales.get(dateKey) || 0;
      dailySales.set(dateKey, current + sale.quantity);
    });

    const values = Array.from(dailySales.values());
    const avgDaily = values.reduce((a, b) => a + b, 0) / values.length;

    // Простой прогноз: среднее значение
    const forecast = [];
    const today = new Date();
    for (let i = 1; i <= days; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() + i);
      forecast.push({
        date,
        predictedQuantity: Math.round(avgDaily),
        confidence: 70, // Базовая уверенность
      });
    }

    return forecast;
  }

  private detectTrend(sales: ProductSale[]): 'increasing' | 'decreasing' | 'stable' {
    if (sales.length < 14) return 'stable';

    const firstHalf = sales.slice(0, Math.floor(sales.length / 2));
    const secondHalf = sales.slice(Math.floor(sales.length / 2));

    const firstAvg =
      firstHalf.reduce((sum, s) => sum + s.quantity, 0) / firstHalf.length;
    const secondAvg =
      secondHalf.reduce((sum, s) => sum + s.quantity, 0) / secondHalf.length;

    const change = ((secondAvg - firstAvg) / firstAvg) * 100;

    if (change > 10) return 'increasing';
    if (change < -10) return 'decreasing';
    return 'stable';
  }

  private calculatePriceRecommendation(
    product: any,
    sales: ProductSale[],
  ): PriceRecommendation {
    const currentPrice = product.price || 0;
    const costPrice = product.costPrice || 0;

    // Анализ продаж при разных ценах
    const pricePoints = sales.map((s) => ({
      price: s.price,
      quantity: s.quantity,
      revenue: Number(s.totalAmount),
    }));

    // Находим оптимальную цену (максимизация выручки)
    let bestPrice = currentPrice;
    let bestRevenue = 0;

    // Тестируем цены в диапазоне ±30%
    for (let price = currentPrice * 0.7; price <= currentPrice * 1.3; price += 10) {
      // Упрощенная модель: предполагаем, что спрос падает при росте цены
      const priceElasticity = -1.5; // Эластичность спроса
      const priceChange = (price - currentPrice) / currentPrice;
      const demandChange = priceChange * priceElasticity;
      const estimatedQuantity = sales.reduce((sum, s) => sum + s.quantity, 0) / sales.length;
      const estimatedDemand = estimatedQuantity * (1 + demandChange);
      const estimatedRevenue = price * Math.max(0, estimatedDemand);

      if (estimatedRevenue > bestRevenue) {
        bestRevenue = estimatedRevenue;
        bestPrice = price;
      }
    }

    const minPrice = Math.max(costPrice * 1.1, currentPrice * 0.8); // Минимум: себестоимость + 10%
    const maxPrice = currentPrice * 1.3; // Максимум: +30%

    return {
      productId: product.id,
      productName: product.name,
      currentPrice,
      recommendedPrice: Math.round(bestPrice),
      minPrice: Math.round(minPrice),
      maxPrice: Math.round(maxPrice),
      confidence: 75,
      reasoning: `Рекомендуемая цена основана на анализе ${sales.length} продаж и оптимизации выручки`,
    };
  }
}

