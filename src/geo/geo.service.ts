import { Injectable, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, In } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { RegionalData } from './regional-data.entity';
import { ProductSale } from '../products/product-sale.entity';
import { MarketplaceAccount } from '../integrations/marketplace-account.entity';
import { IntegrationsService } from '../integrations/integrations.service';

export interface RegionalStats {
  region: string;
  regionCode?: string;
  ordersCount: number;
  totalRevenue: number;
  totalProfit: number;
  averageOrderValue: number;
  productsSold: number;
  growthRate?: number;
  topProducts: Array<{
    productId: string;
    productName: string;
    quantity: number;
    revenue: number;
  }>;
}

@Injectable()
export class GeoService {
  constructor(
    @InjectRepository(RegionalData)
    private regionalDataRepository: Repository<RegionalData>,
    @InjectRepository(ProductSale)
    private salesRepository: Repository<ProductSale>,
    @InjectRepository(MarketplaceAccount)
    private accountsRepository: Repository<MarketplaceAccount>,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private integrationsService: IntegrationsService,
  ) {}

  async getRegionalStats(
    userId: string,
    organizationId: string | null,
    startDate: Date,
    endDate: Date,
  ): Promise<RegionalStats[]> {
    // Генерируем ключ кеша
    const cacheKey = `regional:${userId}:${organizationId || 'user'}:${startDate.toISOString()}:${endDate.toISOString()}`;
    
    // Пытаемся получить из кеша
    const cached = await this.cacheManager.get<RegionalStats[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const where: any = { user: { id: userId } };
    if (organizationId) {
      where.organization = { id: organizationId };
    }

    const accounts = await this.accountsRepository.find({ where });
    const accountIds = accounts.map((a) => a.id);

    // Получаем продажи за период
    const sales = await this.salesRepository.find({
      where: {
        marketplaceAccount: { id: In(accountIds) },
        saleDate: Between(startDate, endDate),
      },
      relations: ['product'],
    });

    // Агрегируем данные по регионам
    const regionalMap = new Map<string, RegionalStats>();

    sales.forEach((sale) => {
      const region = sale.region || 'Не указан';
      
      if (!regionalMap.has(region)) {
        regionalMap.set(region, {
          region,
          ordersCount: 0,
          totalRevenue: 0,
          totalProfit: 0,
          averageOrderValue: 0,
          productsSold: 0,
          topProducts: [],
        });
      }

      const stats = regionalMap.get(region);
      stats.ordersCount += 1;
      stats.totalRevenue += Number(sale.totalAmount);
      stats.totalProfit += Number(sale.profit || 0);
      stats.productsSold += sale.quantity;

      // Собираем топ товаров
      const productId = sale.product?.id;
      const existingProduct = stats.topProducts.find((p) => p.productId === productId);
      
      if (existingProduct) {
        existingProduct.quantity += sale.quantity;
        existingProduct.revenue += Number(sale.totalAmount);
      } else {
        stats.topProducts.push({
          productId,
          productName: sale.product?.name || 'Неизвестный товар',
          quantity: sale.quantity,
          revenue: Number(sale.totalAmount),
        });
      }
    });

    // Вычисляем средний чек и сортируем топ товаров
    const result = Array.from(regionalMap.values()).map((stats) => {
      stats.averageOrderValue = stats.ordersCount > 0
        ? stats.totalRevenue / stats.ordersCount
        : 0;
      
      stats.topProducts = stats.topProducts
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10);

      return stats;
    });

    // Вычисляем темп роста (сравнение с предыдущим периодом)
    const previousStart = new Date(startDate);
    previousStart.setDate(
      previousStart.getDate() -
        (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
    );
    const previousEnd = new Date(startDate);

    const previousSales = await this.salesRepository.find({
      where: {
        marketplaceAccount: { id: In(accountIds) },
        saleDate: Between(previousStart, previousEnd),
      },
    });

    const previousRevenueByRegion = new Map<string, number>();
    previousSales.forEach((sale) => {
      const region = sale.region || 'Не указан';
      const current = previousRevenueByRegion.get(region) || 0;
      previousRevenueByRegion.set(region, current + Number(sale.totalAmount));
    });

    result.forEach((stats) => {
      const previousRevenue = previousRevenueByRegion.get(stats.region) || 0;
      stats.growthRate = previousRevenue > 0
        ? ((stats.totalRevenue - previousRevenue) / previousRevenue) * 100
        : stats.totalRevenue > 0 ? 100 : 0;
    });

    // Сохраняем в кеш на 10 минут
    await this.cacheManager.set(cacheKey, result, 600);

    return result;
  }

  async getRegionDetails(
    userId: string,
    organizationId: string | null,
    region: string,
    startDate: Date,
    endDate: Date,
  ): Promise<RegionalStats | null> {
    const stats = await this.getRegionalStats(
      userId,
      organizationId,
      startDate,
      endDate,
    );

    return stats.find((s) => s.region === region) || null;
  }

  async syncRegionalDataFromMarketplace(
    accountId: string,
    userId: string,
    organizationId: string | null,
    startDate?: Date,
    endDate?: Date,
  ): Promise<{ created: number; updated: number }> {
    const account = await this.integrationsService.findOne(accountId, userId);
    const integration = await this.integrationsService.getIntegrationInstance(
      accountId,
      userId,
    );

    try {
      const regionalData = await integration.getRegionalData({
        startDate: startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        endDate: endDate || new Date(),
      });

      let created = 0;
      let updated = 0;

      for (const data of regionalData) {
        const date = new Date();
        date.setHours(0, 0, 0, 0);

        // Ищем существующие данные
        let regional = await this.regionalDataRepository.findOne({
          where: {
            user: { id: userId },
            organization: organizationId ? { id: organizationId } : null,
            marketplaceAccount: { id: accountId },
            region: data.region,
            date,
          },
        });

        if (regional) {
          // Обновляем существующие данные
          regional.ordersCount = data.ordersCount;
          regional.totalRevenue = data.totalAmount;
          regional.averageOrderValue = data.averageOrderValue;
          regional.productsSold = data.topProducts?.reduce(
            (sum: number, p: any) => sum + (p.quantity || 0),
            0,
          ) || 0;
          regional.topProducts = data.topProducts || [];
          updated++;
        } else {
          // Создаем новые данные
          regional = this.regionalDataRepository.create({
            user: { id: userId } as any,
            organization: organizationId ? ({ id: organizationId } as any) : null,
            marketplaceAccount: account,
            region: data.region,
            regionCode: data.regionCode,
            date,
            ordersCount: data.ordersCount,
            totalRevenue: data.totalAmount,
            averageOrderValue: data.averageOrderValue,
            productsSold: data.topProducts?.reduce(
              (sum: number, p: any) => sum + (p.quantity || 0),
              0,
            ) || 0,
            topProducts: data.topProducts || [],
          });
          created++;
        }

        await this.regionalDataRepository.save(regional);
      }

      await integration.disconnect();
      return { created, updated };
    } catch (error) {
      await integration.disconnect();
      throw new Error(`Failed to sync regional data: ${error.message}`);
    }
  }

  async getRegionalComparison(
    userId: string,
    organizationId: string | null,
    startDate: Date,
    endDate: Date,
    sortBy: 'revenue' | 'orders' | 'growth' = 'revenue',
  ): Promise<RegionalStats[]> {
    const stats = await this.getRegionalStats(
      userId,
      organizationId,
      startDate,
      endDate,
    );

    return stats.sort((a, b) => {
      switch (sortBy) {
        case 'revenue':
          return b.totalRevenue - a.totalRevenue;
        case 'orders':
          return b.ordersCount - a.ordersCount;
        case 'growth':
          return (b.growthRate || 0) - (a.growthRate || 0);
        default:
          return b.totalRevenue - a.totalRevenue;
      }
    });
  }

  async getPromisingRegions(
    userId: string,
    organizationId: string | null,
    limit: number = 10,
  ): Promise<RegionalStats[]> {
    const now = new Date();
    const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const previous30Days = new Date(
      now.getTime() - 60 * 24 * 60 * 60 * 1000,
    );

    const currentStats = await this.getRegionalStats(
      userId,
      organizationId,
      last30Days,
      now,
    );

    const previousStats = await this.getRegionalStats(
      userId,
      organizationId,
      previous30Days,
      last30Days,
    );

    // Находим регионы с высоким темпом роста и хорошей выручкой
    const promising = currentStats
      .filter((region) => {
        const previous = previousStats.find((p) => p.region === region.region);
        const growthRate = previous
          ? ((region.totalRevenue - previous.totalRevenue) /
              previous.totalRevenue) *
            100
          : region.totalRevenue > 0
          ? 100
          : 0;

        return (
          growthRate > 20 && // Рост более 20%
          region.totalRevenue > 10000 && // Выручка более 10k
          region.ordersCount > 10 // Более 10 заказов
        );
      })
      .sort((a, b) => (b.growthRate || 0) - (a.growthRate || 0))
      .slice(0, limit);

    return promising;
  }

  async getProductHeatMap(
    userId: string,
    organizationId: string | null,
    productId?: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<any> {
    const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate || new Date();

    const where: any = { user: { id: userId } };
    if (organizationId) {
      where.organization = { id: organizationId };
    }

    const accounts = await this.accountsRepository.find({ where });
    const accountIds = accounts.map((a) => a.id);

    const sales = await this.salesRepository.find({
      where: {
        marketplaceAccount: { id: In(accountIds) },
        saleDate: Between(start, end),
        ...(productId ? { product: { id: productId } } : {}),
      },
      relations: ['product'],
    });

    // Группируем по регионам и товарам
    const heatMap = new Map<string, Map<string, number>>();

    sales.forEach((sale) => {
      const region = sale.region || 'Не указан';
      const productName = sale.product?.name || 'Неизвестный товар';

      if (!heatMap.has(region)) {
        heatMap.set(region, new Map());
      }

      const regionMap = heatMap.get(region);
      const current = regionMap.get(productName) || 0;
      regionMap.set(productName, current + sale.quantity);
    });

    // Преобразуем в массив для фронтенда
    const result = Array.from(heatMap.entries()).map(([region, products]) => ({
      region,
      products: Array.from(products.entries())
        .map(([productName, quantity]) => ({
          productName,
          quantity,
        }))
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 10), // Топ-10 товаров в регионе
    }));

    return result;
  }

  async getLogisticsAnalysis(
    userId: string,
    organizationId: string | null,
    startDate?: Date,
    endDate?: Date,
  ): Promise<any> {
    const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate || new Date();

    const stats = await this.getRegionalStats(
      userId,
      organizationId,
      start,
      end,
    );

    // Группируем регионы по федеральным округам (упрощенная версия)
    const federalDistricts: Record<string, string[]> = {
      'Центральный': [
        'Москва',
        'Московская область',
        'Воронежская область',
        'Ярославская область',
        'Тульская область',
      ],
      'Северо-Западный': [
        'Санкт-Петербург',
        'Ленинградская область',
        'Новгородская область',
      ],
      'Южный': ['Краснодарский край', 'Ростовская область'],
      'Приволжский': [
        'Нижегородская область',
        'Самарская область',
        'Республика Татарстан',
      ],
      'Уральский': ['Свердловская область', 'Челябинская область'],
      'Сибирский': ['Новосибирская область', 'Красноярский край'],
      'Дальневосточный': ['Приморский край', 'Хабаровский край'],
    };

    const districtStats = new Map<string, any>();

    stats.forEach((region) => {
      let district = 'Другой';
      for (const [dist, regions] of Object.entries(federalDistricts)) {
        if (regions.some((r) => region.region.includes(r))) {
          district = dist;
          break;
        }
      }

      if (!districtStats.has(district)) {
        districtStats.set(district, {
          district,
          ordersCount: 0,
          totalRevenue: 0,
          regions: [],
        });
      }

      const dist = districtStats.get(district);
      dist.ordersCount += region.ordersCount;
      dist.totalRevenue += region.totalRevenue;
      dist.regions.push(region);
    });

    // Анализ логистических затрат (упрощенный)
    const logisticsAnalysis = Array.from(districtStats.values()).map(
      (district) => {
        // Примерная оценка логистических затрат (можно улучшить с реальными данными)
        const estimatedLogisticsCost = district.totalRevenue * 0.1; // 10% от выручки
        const averageOrderValue =
          district.ordersCount > 0
            ? district.totalRevenue / district.ordersCount
            : 0;

        return {
          ...district,
          estimatedLogisticsCost,
          averageOrderValue,
          logisticsEfficiency:
            district.totalRevenue > 0
              ? (district.totalRevenue - estimatedLogisticsCost) /
                district.totalRevenue
              : 0,
        };
      },
    );

    return {
      districts: logisticsAnalysis.sort(
        (a, b) => b.totalRevenue - a.totalRevenue,
      ),
      summary: {
        totalRegions: stats.length,
        totalDistricts: logisticsAnalysis.length,
        averageLogisticsCost: logisticsAnalysis.reduce(
          (sum, d) => sum + d.estimatedLogisticsCost,
          0,
        ) / logisticsAnalysis.length,
      },
    };
  }

  async exportRegionalAnalytics(
    userId: string,
    organizationId: string | null,
    startDate: Date,
    endDate: Date,
    format: 'json' | 'csv' = 'json',
  ): Promise<any> {
    const stats = await this.getRegionalStats(
      userId,
      organizationId,
      startDate,
      endDate,
    );

    if (format === 'csv') {
      // Генерируем CSV
      const headers = [
        'Регион',
        'Заказов',
        'Выручка',
        'Прибыль',
        'Средний чек',
        'Товаров продано',
        'Темп роста (%)',
      ];
      const rows = stats.map((s) => [
        s.region,
        s.ordersCount,
        s.totalRevenue.toFixed(2),
        s.totalProfit.toFixed(2),
        s.averageOrderValue.toFixed(2),
        s.productsSold,
        (s.growthRate || 0).toFixed(2),
      ]);

      const csv = [
        headers.join(','),
        ...rows.map((row) => row.join(',')),
      ].join('\n');

      return {
        format: 'csv',
        data: csv,
        filename: `regional_analytics_${startDate.toISOString()}_${endDate.toISOString()}.csv`,
      };
    }

    // JSON формат
    return {
      format: 'json',
      data: stats,
      metadata: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        totalRegions: stats.length,
        totalRevenue: stats.reduce((sum, s) => sum + s.totalRevenue, 0),
        totalOrders: stats.reduce((sum, s) => sum + s.ordersCount, 0),
      },
    };
  }
}

