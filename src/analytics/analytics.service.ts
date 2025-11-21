import { Injectable, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, In } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { ProductSale } from '../products/product-sale.entity';
import { Product } from '../products/product.entity';
import { MarketplaceAccount } from '../integrations/marketplace-account.entity';
import { IntegrationsService } from '../integrations/integrations.service';

export interface DashboardStats {
  totalRevenue: number;
  totalProfit: number;
  totalSales: number;
  averageOrderValue: number;
  conversionRate: number;
  growthRate: number;
  topProducts: any[];
  salesByMarketplace: any[];
  salesByPeriod: any[];
}

export interface KPIMetrics {
  revenue: {
    current: number;
    previous: number;
    change: number;
    changePercent: number;
  };
  profit: {
    current: number;
    previous: number;
    change: number;
    changePercent: number;
  };
  orders: {
    current: number;
    previous: number;
    change: number;
    changePercent: number;
  };
  averageOrderValue: {
    current: number;
    previous: number;
    change: number;
    changePercent: number;
  };
}

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(ProductSale)
    private salesRepository: Repository<ProductSale>,
    @InjectRepository(Product)
    private productsRepository: Repository<Product>,
    @InjectRepository(MarketplaceAccount)
    private accountsRepository: Repository<MarketplaceAccount>,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private integrationsService: IntegrationsService,
  ) {}

  async getDashboardStats(
    userId: string,
    organizationId: string | null,
    startDate: Date,
    endDate: Date,
  ): Promise<DashboardStats> {
    // Генерируем ключ кеша
    const cacheKey = `dashboard:${userId}:${organizationId || 'user'}:${startDate.toISOString()}:${endDate.toISOString()}`;
    
    // Пытаемся получить из кеша
    const cached = await this.cacheManager.get<DashboardStats>(cacheKey);
    if (cached) {
      return cached;
    }

    // Получаем аккаунты пользователя
    const where: any = { user: { id: userId } };
    if (organizationId) {
      where.organization = { id: organizationId };
    }

    const accounts = await this.accountsRepository.find({ where });
    const accountIds = accounts.map((a) => a.id);

    // Если у пользователя нет аккаунтов, возвращаем пустую статистику
    if (accountIds.length === 0) {
      const emptyStats: DashboardStats = {
        totalRevenue: 0,
        totalProfit: 0,
        totalSales: 0,
        averageOrderValue: 0,
        conversionRate: 0,
        growthRate: 0,
        topProducts: [],
        salesByMarketplace: [],
        salesByPeriod: [],
      };
      // Сохраняем в кеш на 5 минут
      await this.cacheManager.set(cacheKey, emptyStats, 300);
      return emptyStats;
    }

    // Оптимизированный запрос - выбираем только нужные поля
    const sales = await this.salesRepository
      .createQueryBuilder('sale')
      .select([
        'sale.id',
        'sale.saleDate',
        'sale.quantity',
        'sale.totalAmount',
        'sale.profit',
        'sale.orderId',
        'sale.region',
        'product.id',
        'product.name',
        'marketplaceAccount.id',
        'marketplaceAccount.marketplaceType',
      ])
      .leftJoin('sale.product', 'product')
      .leftJoin('sale.marketplaceAccount', 'marketplaceAccount')
      .where('marketplaceAccount.id IN (:...accountIds)', { accountIds })
      .andWhere('sale.saleDate BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      })
      .getMany();

    // Расчет метрик
    const totalRevenue = sales.reduce(
      (sum, sale) => sum + Number(sale.totalAmount),
      0,
    );
    const totalProfit = sales.reduce(
      (sum, sale) => sum + Number(sale.profit || 0),
      0,
    );
    const totalSales = sales.reduce((sum, sale) => sum + sale.quantity, 0);
    const uniqueOrders = new Set(sales.map((s) => s.orderId)).size;
    const averageOrderValue =
      uniqueOrders > 0 ? totalRevenue / uniqueOrders : 0;

    // Продажи по маркетплейсам
    const salesByMarketplace = this.groupByMarketplace(sales);

    // Продажи по периодам (дни)
    const salesByPeriod = this.groupByPeriod(sales, startDate, endDate);

    // Топ товаров
    const topProducts = this.getTopProducts(sales, 10);

    // Сравнение с предыдущим периодом
    const previousPeriodStart = new Date(startDate);
    previousPeriodStart.setDate(
      previousPeriodStart.getDate() -
        (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
    );
    const previousPeriodEnd = new Date(startDate);

    // Если нет аккаунтов, предыдущие продажи тоже пустые
    const previousSales = accountIds.length > 0
      ? await this.salesRepository.find({
          where: {
            marketplaceAccount: { id: In(accountIds) },
            saleDate: Between(previousPeriodStart, previousPeriodEnd),
          },
        })
      : [];

    const previousRevenue = previousSales.reduce(
      (sum, sale) => sum + Number(sale.totalAmount),
      0,
    );
    const growthRate =
      previousRevenue > 0
        ? ((totalRevenue - previousRevenue) / previousRevenue) * 100
        : 0;

    const stats: DashboardStats = {
      totalRevenue,
      totalProfit,
      totalSales,
      averageOrderValue,
      conversionRate: 0, // TODO: Рассчитать на основе данных о визитах
      growthRate,
      topProducts,
      salesByMarketplace,
      salesByPeriod,
    };

    // Сохраняем в кеш на 5 минут
    await this.cacheManager.set(cacheKey, stats, 300);

    return stats;
  }

  async getKPIMetrics(
    userId: string,
    organizationId: string | null,
    period: 'day' | 'week' | 'month' = 'month',
  ): Promise<KPIMetrics> {
    // Генерируем ключ кеша
    const cacheKey = `kpi:${userId}:${organizationId || 'user'}:${period}`;
    
    // Пытаемся получить из кеша
    const cached = await this.cacheManager.get<KPIMetrics>(cacheKey);
    if (cached) {
      return cached;
    }

    const now = new Date();
    let currentStart: Date;
    let currentEnd: Date = now;
    let previousStart: Date;
    let previousEnd: Date;

    switch (period) {
      case 'day':
        currentStart = new Date(now);
        currentStart.setHours(0, 0, 0, 0);
        previousStart = new Date(currentStart);
        previousStart.setDate(previousStart.getDate() - 1);
        previousEnd = new Date(currentStart);
        break;
      case 'week':
        currentStart = new Date(now);
        currentStart.setDate(currentStart.getDate() - 7);
        previousStart = new Date(currentStart);
        previousStart.setDate(previousStart.getDate() - 7);
        previousEnd = new Date(currentStart);
        break;
      case 'month':
        currentStart = new Date(now.getFullYear(), now.getMonth(), 1);
        previousStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        previousEnd = new Date(now.getFullYear(), now.getMonth(), 0);
        break;
    }

    const where: any = { user: { id: userId } };
    if (organizationId) {
      where.organization = { id: organizationId };
    }

    const accounts = await this.accountsRepository.find({ where });
    const accountIds = accounts.map((a) => a.id);

    // Если у пользователя нет аккаунтов, возвращаем пустые метрики
    if (accountIds.length === 0) {
      const emptyMetrics: KPIMetrics = {
        revenue: { current: 0, previous: 0, change: 0, changePercent: 0 },
        profit: { current: 0, previous: 0, change: 0, changePercent: 0 },
        orders: { current: 0, previous: 0, change: 0, changePercent: 0 },
        averageOrderValue: { current: 0, previous: 0, change: 0, changePercent: 0 },
      };
      await this.cacheManager.set(cacheKey, emptyMetrics, 300);
      return emptyMetrics;
    }

    const [currentSales, previousSales] = await Promise.all([
      this.salesRepository.find({
        where: {
          marketplaceAccount: { id: In(accountIds) },
          saleDate: Between(currentStart, currentEnd),
        },
      }),
      this.salesRepository.find({
        where: {
          marketplaceAccount: { id: In(accountIds) },
          saleDate: Between(previousStart, previousEnd),
        },
      }),
    ]);

    const calculateMetrics = (sales: ProductSale[]) => {
      const revenue = sales.reduce(
        (sum, sale) => sum + Number(sale.totalAmount),
        0,
      );
      const profit = sales.reduce(
        (sum, sale) => sum + Number(sale.profit || 0),
        0,
      );
      const orders = new Set(sales.map((s) => s.orderId)).size;
      const avgOrderValue = orders > 0 ? revenue / orders : 0;

      return { revenue, profit, orders, avgOrderValue };
    };

    const current = calculateMetrics(currentSales);
    const previous = calculateMetrics(previousSales);

    const calculateChange = (current: number, previous: number) => {
      const change = current - previous;
      const changePercent = previous > 0 ? (change / previous) * 100 : 0;
      return { change, changePercent };
    };

    const metrics = {
      revenue: {
        current: current.revenue,
        previous: previous.revenue,
        ...calculateChange(current.revenue, previous.revenue),
      },
      profit: {
        current: current.profit,
        previous: previous.profit,
        ...calculateChange(current.profit, previous.profit),
      },
      orders: {
        current: current.orders,
        previous: previous.orders,
        ...calculateChange(current.orders, previous.orders),
      },
      averageOrderValue: {
        current: current.avgOrderValue,
        previous: previous.avgOrderValue,
        ...calculateChange(current.avgOrderValue, previous.avgOrderValue),
      },
    };

    // Сохраняем в кеш на 5 минут
    await this.cacheManager.set(cacheKey, metrics, 300);

    return metrics;
  }

  private groupByMarketplace(sales: ProductSale[]): any[] {
    const grouped = new Map<string, any>();

    sales.forEach((sale) => {
      const marketplaceType = sale.marketplaceAccount.marketplaceType;
      if (!grouped.has(marketplaceType)) {
        grouped.set(marketplaceType, {
          marketplaceType,
          revenue: 0,
          sales: 0,
          orders: new Set(),
        });
      }

      const group = grouped.get(marketplaceType);
      group.revenue += Number(sale.totalAmount);
      group.sales += sale.quantity;
      group.orders.add(sale.orderId);
    });

    return Array.from(grouped.values()).map((group) => ({
      marketplaceType: group.marketplaceType,
      revenue: group.revenue,
      sales: group.sales,
      orders: group.orders.size,
    }));
  }

  private groupByPeriod(
    sales: ProductSale[],
    startDate: Date,
    endDate: Date,
  ): any[] {
    const periodMap = new Map<string, any>();
    const daysDiff =
      (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);

    sales.forEach((sale) => {
      const dateKey = sale.saleDate.toISOString().split('T')[0];
      if (!periodMap.has(dateKey)) {
        periodMap.set(dateKey, {
          date: dateKey,
          revenue: 0,
          sales: 0,
          orders: new Set(),
        });
      }

      const period = periodMap.get(dateKey);
      period.revenue += Number(sale.totalAmount);
      period.sales += sale.quantity;
      period.orders.add(sale.orderId);
    });

    return Array.from(periodMap.values())
      .map((period) => ({
        date: period.date,
        revenue: period.revenue,
        sales: period.sales,
        orders: period.orders.size,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  private getTopProducts(sales: ProductSale[], limit: number): any[] {
    const productMap = new Map<string, any>();

    sales.forEach((sale) => {
      const productId = sale.product.id;
      if (!productMap.has(productId)) {
        productMap.set(productId, {
          product: {
            id: sale.product.id,
            name: sale.product.name,
            sku: sale.product.sku,
          },
          revenue: 0,
          sales: 0,
        });
      }

      const product = productMap.get(productId);
      product.revenue += Number(sale.totalAmount);
      product.sales += sale.quantity;
    });

    return Array.from(productMap.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, limit);
  }

  async getAdAnalytics(
    userId: string,
    organizationId: string | null,
    startDate: Date,
    endDate: Date,
  ): Promise<any> {
    const where: any = { user: { id: userId } };
    if (organizationId) {
      where.organization = { id: organizationId };
    }

    const accounts = await this.accountsRepository.find({ where });
    
    let totalSpent = 0;
    let totalRevenue = 0;
    const campaigns: any[] = [];
    const byChannel = new Map<string, { spent: number; revenue: number; campaigns: number }>();

    // Получаем данные о рекламе из всех интеграций
    for (const account of accounts) {
      try {
        const integration = await this.integrationsService.getIntegrationInstance(
          account.id,
          userId,
        );

        const adCampaigns = await integration.getAdCampaigns({
          status: 'all',
        });

        for (const campaign of adCampaigns) {
          const statistics = await integration.getAdStatistics(campaign.id, {
            startDate,
            endDate,
          });

          const spent = statistics.spent || campaign.spent || 0;
          const revenue = statistics.revenue || 0;
          const roi = spent > 0 ? ((revenue - spent) / spent) * 100 : 0;

          totalSpent += spent;
          totalRevenue += revenue;

          campaigns.push({
            id: campaign.id,
            name: campaign.name,
            marketplaceType: account.marketplaceType,
            spent,
            revenue,
            roi,
            impressions: statistics.impressions || 0,
            clicks: statistics.clicks || 0,
            conversions: statistics.conversions || 0,
            status: campaign.status,
          });

          // Группируем по маркетплейсам
          const channel = account.marketplaceType;
          if (!byChannel.has(channel)) {
            byChannel.set(channel, { spent: 0, revenue: 0, campaigns: 0 });
          }
          const channelData = byChannel.get(channel);
          channelData.spent += spent;
          channelData.revenue += revenue;
          channelData.campaigns += 1;
        }

        await integration.disconnect();
      } catch (error) {
        // Пропускаем аккаунты без поддержки рекламы
        continue;
      }
    }

    const totalROI = totalSpent > 0 ? ((totalRevenue - totalSpent) / totalSpent) * 100 : 0;

    return {
      totalSpent,
      totalRevenue,
      totalROI,
      campaigns: campaigns.sort((a, b) => b.revenue - a.revenue),
      byChannel: Array.from(byChannel.entries()).map(([channel, data]) => ({
        channel,
        ...data,
        roi: data.spent > 0 ? ((data.revenue - data.spent) / data.spent) * 100 : 0,
      })),
    };
  }

  async getAdROI(
    userId: string,
    organizationId: string | null,
    campaignId?: string,
  ): Promise<any> {
    const where: any = { user: { id: userId } };
    if (organizationId) {
      where.organization = { id: organizationId };
    }

    const accounts = await this.accountsRepository.find({ where });

    if (campaignId) {
      // Получаем ROI для конкретной кампании
      for (const account of accounts) {
        try {
          const integration = await this.integrationsService.getIntegrationInstance(
            account.id,
            userId,
          );

          const statistics = await integration.getAdStatistics(campaignId, {
            startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
            endDate: new Date(),
          });

          await integration.disconnect();

          const spent = statistics.spent || 0;
          const revenue = statistics.revenue || 0;
          const roi = spent > 0 ? ((revenue - spent) / spent) * 100 : 0;

          return {
            campaignId,
            spent,
            revenue,
            roi,
            conversions: statistics.conversions || 0,
            impressions: statistics.impressions || 0,
            clicks: statistics.clicks || 0,
            ctr: statistics.clicks > 0 && statistics.impressions > 0
              ? (statistics.clicks / statistics.impressions) * 100
              : 0,
            cpc: statistics.clicks > 0 ? spent / statistics.clicks : 0,
            cpa: statistics.conversions > 0 ? spent / statistics.conversions : 0,
          };
        } catch (error) {
          continue;
        }
      }

      throw new Error(`Campaign ${campaignId} not found`);
    }

    // Если campaignId не указан, возвращаем общий ROI
    const analytics = await this.getAdAnalytics(
      userId,
      organizationId,
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      new Date(),
    );

    return {
      totalSpent: analytics.totalSpent,
      totalRevenue: analytics.totalRevenue,
      roi: analytics.totalROI,
      campaignsCount: analytics.campaigns.length,
    };
  }

  async optimizeAdBudgets(
    userId: string,
    organizationId: string | null,
  ): Promise<any> {
    const analytics = await this.getAdAnalytics(
      userId,
      organizationId,
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      new Date(),
    );

    // Анализируем эффективность кампаний
    const campaigns = analytics.campaigns.map((campaign) => ({
      ...campaign,
      efficiency: campaign.spent > 0
        ? campaign.revenue / campaign.spent
        : 0,
    }));

    // Сортируем по эффективности
    campaigns.sort((a, b) => b.efficiency - a.efficiency);

    // Рекомендации по оптимизации
    const recommendations = [];

    // Находим неэффективные кампании (ROI < 0 или очень низкий)
    const inefficientCampaigns = campaigns.filter(
      (c) => c.roi < 0 || (c.roi < 50 && c.spent > 1000),
    );

    if (inefficientCampaigns.length > 0) {
      recommendations.push({
        type: 'reduce_budget',
        priority: 'high',
        message: `Рекомендуется снизить бюджет для ${inefficientCampaigns.length} неэффективных кампаний`,
        campaigns: inefficientCampaigns.slice(0, 5).map((c) => ({
          id: c.id,
          name: c.name,
          currentSpent: c.spent,
          roi: c.roi,
          recommendedAction: 'reduce_budget',
          recommendedBudget: c.spent * 0.5, // Снизить на 50%
        })),
      });
    }

    // Находим эффективные кампании для увеличения бюджета
    const efficientCampaigns = campaigns.filter(
      (c) => c.roi > 100 && c.spent > 0,
    );

    if (efficientCampaigns.length > 0) {
      recommendations.push({
        type: 'increase_budget',
        priority: 'medium',
        message: `Рекомендуется увеличить бюджет для ${efficientCampaigns.length} эффективных кампаний`,
        campaigns: efficientCampaigns.slice(0, 5).map((c) => ({
          id: c.id,
          name: c.name,
          currentSpent: c.spent,
          roi: c.roi,
          recommendedAction: 'increase_budget',
          recommendedBudget: c.spent * 1.5, // Увеличить на 50%
        })),
      });
    }

    // Анализ по каналам
    const channelAnalysis = analytics.byChannel.map((channel) => ({
      channel: channel.channel,
      roi: channel.roi,
      spent: channel.spent,
      revenue: channel.revenue,
      recommendation:
        channel.roi < 0
          ? 'consider_pause'
          : channel.roi < 50
          ? 'reduce_budget'
          : channel.roi > 100
          ? 'increase_budget'
          : 'maintain',
    }));

    return {
      totalBudget: analytics.totalSpent,
      totalRevenue: analytics.totalRevenue,
      averageROI: analytics.totalROI,
      recommendations,
      channelAnalysis,
      summary: {
        totalCampaigns: campaigns.length,
        efficientCampaigns: efficientCampaigns.length,
        inefficientCampaigns: inefficientCampaigns.length,
        potentialSavings: inefficientCampaigns.reduce(
          (sum, c) => sum + c.spent * 0.5,
          0,
        ),
        potentialRevenue: efficientCampaigns.reduce(
          (sum, c) => sum + (c.spent * 0.5 * (c.roi / 100)),
          0,
        ),
      },
    };
  }
}

