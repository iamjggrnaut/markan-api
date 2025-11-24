import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import {
  IMarketplaceIntegration,
  MarketplaceCredentials,
  SalesParams,
  SalesData,
  ProductsParams,
  ProductData,
  StockParams,
  StockData,
  OrdersParams,
  OrderData,
  AdCampaignsParams,
  AdCampaignData,
  AdStatisticsParams,
  AdStatisticsData,
  RegionalDataParams,
  RegionalData,
} from '../../interfaces/marketplace.interface';

const WB_RATE_LIMIT_INTERVAL_MS = 61_000;
const WB_WINDOW_DAYS = 3;
const MAX_WINDOW_LIMIT = 1000;
const MAX_RETRIES = 3;

@Injectable()
export class WildberriesService implements IMarketplaceIntegration {
  private readonly logger = new Logger(WildberriesService.name);
  private legacyClient: AxiosInstance;
  private analyticsClient: AxiosInstance;
  private contentClient: AxiosInstance;
  private marketplaceClient: AxiosInstance;
  private advertClient: AxiosInstance;
  private credentials: MarketplaceCredentials;
  private readonly statisticsBaseURL = 'https://statistics-api.wildberries.ru';
  private readonly contentBaseURL = 'https://content-api.wildberries.ru';
  private readonly marketplaceBaseURL = 'https://marketplace-api.wildberries.ru';
  private readonly advertBaseURL = 'https://advert-api.wildberries.ru';
  private lastRequestAt = 0;

  async connect(credentials: MarketplaceCredentials): Promise<boolean> {
    this.credentials = credentials;

    if (!credentials.apiKey) {
      throw new BadRequestException('API key is required for Wildberries');
    }

    const headers = {
      Authorization: credentials.apiKey,
      'Content-Type': 'application/json',
    };

    this.logger.log('Initializing Wildberries API clients...');

    // Всегда пересоздаем клиенты, даже если они уже существуют
    // Это гарантирует, что клиенты будут инициализированы после disconnect()
    this.legacyClient = axios.create({
      baseURL: this.statisticsBaseURL,
      headers,
      timeout: 30000,
    });

    this.analyticsClient = axios.create({
      baseURL: this.statisticsBaseURL,
      headers,
      timeout: 30000,
    });

    this.contentClient = axios.create({
      baseURL: this.contentBaseURL,
      headers,
      timeout: 30000,
    });

    this.marketplaceClient = axios.create({
      baseURL: this.marketplaceBaseURL,
      headers,
      timeout: 30000,
    });

    this.advertClient = axios.create({
      baseURL: this.advertBaseURL,
      headers,
      timeout: 30000,
    });

    // Проверяем, что все клиенты созданы
    if (!this.legacyClient || !this.analyticsClient || !this.contentClient || !this.marketplaceClient || !this.advertClient) {
      this.logger.error('Failed to initialize one or more Wildberries API clients');
      throw new BadRequestException('Failed to initialize Wildberries API clients');
    }

    this.logger.log('Wildberries API clients initialized successfully');

    return this.testConnection();
  }

  async disconnect(): Promise<void> {
    this.logger.log('Disconnecting Wildberries API clients...');
    this.legacyClient = null;
    this.analyticsClient = null;
    this.contentClient = null;
    this.marketplaceClient = null;
    this.advertClient = null;
    this.credentials = null;
    this.lastRequestAt = 0;
    this.logger.log('Wildberries API clients disconnected');
  }

  async testConnection(): Promise<boolean> {
    // Проверяем только, что клиенты созданы
    // Реальная проверка доступности API будет при первом использовании
    if (!this.contentClient || !this.analyticsClient || !this.legacyClient) {
      throw new BadRequestException('Failed to initialize Wildberries API clients');
    }
    
    // Опционально: проверяем только Content API (основной для товаров)
    // Если не доступен, это будет видно при первом запросе товаров
    try {
      await this.contentClient.post('/content/v2/get/cards/list', {
        settings: {
          cursor: { limit: 1 },
          filter: { withPhoto: -1 },
        },
      });
    } catch (error) {
      // Если Content API недоступен, логируем предупреждение, но не блокируем подключение
      // Реальная ошибка будет при попытке получить товары
      this.logger.warn(`Content API test failed: ${error.message}. Will retry on first product request.`);
    }

    return true;
  }

  async getSales(params: SalesParams): Promise<SalesData[]> {
    if (!this.analyticsClient) {
      throw new BadRequestException('Wildberries API client not initialized. Call connect() first.');
    }
    try {
      const dateFrom = params.startDate
        ? params.startDate.toISOString().split('T')[0]
        : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const dateTo = params.endDate
        ? params.endDate.toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0];

      const analyticsSales = await this.fetchSalesFromAnalytics(dateFrom, dateTo, params);
      if (analyticsSales.length > 0) {
        return analyticsSales;
      }

      this.logger.warn('WB analytics sales response is empty, falling back to legacy supplier endpoint');
      const legacySales = await this.fetchLegacySales(dateFrom, dateTo, params);
      return legacySales;
    } catch (error) {
      this.logger.warn(`Failed to get sales via analytics API (${error.message}). Trying legacy endpoint...`);
      const legacySales = await this.fetchLegacySales(
        params.startDate
          ? params.startDate.toISOString().split('T')[0]
          : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        params.endDate ? params.endDate.toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        params,
      );
      return legacySales;
    }
  }

  async getSalesByDateRange(startDate: Date, endDate: Date): Promise<SalesData[]> {
    return this.getSales({ startDate, endDate });
  }

  async getProducts(params?: ProductsParams): Promise<ProductData[]> {
    if (!this.contentClient) {
      throw new BadRequestException('Wildberries content API client not initialized. Call connect() first.');
    }

    try {
      const limit = Math.min(Math.max(params?.limit ?? 100, 1), 100);
      const filter: Record<string, any> = {
        withPhoto: -1,
      };

      if (params?.categoryId) {
        filter.subjectID = Number(params.categoryId);
      }

      const payload = {
        settings: {
          filter,
          cursor: {
            limit,
          },
        },
      };

      const response = await this.requestWithRetry(
        () => this.contentClient.post('/content/v2/get/cards/list', payload),
        'Failed to get products',
      );

      const cards = response.data?.cards ?? [];
      return this.normalizeProductsData(cards);
    } catch (error) {
      throw new BadRequestException(`Failed to get products: ${error.message}`);
    }
  }

  async getProductById(productId: string): Promise<ProductData> {
    try {
      const products = await this.getProducts();
      const product = products.find((p) => p.id === productId || p.sku === productId);
      
      if (!product) {
        throw new BadRequestException(`Product with ID ${productId} not found`);
      }

      return product;
    } catch (error) {
      throw new BadRequestException(`Failed to get product: ${error.message}`);
    }
  }

  async getStock(params?: StockParams): Promise<StockData[]> {
    // Проверяем, что клиенты инициализированы
    if (!this.analyticsClient && !this.legacyClient) {
      throw new BadRequestException('Wildberries API client not initialized. Call connect() first.');
    }
    
    try {
      // Пытаемся получить остатки через новый API
      if (this.analyticsClient) {
        const stock = await this.fetchStockFromReports(params);
        if (stock.length > 0) {
          return stock;
        }
        this.logger.warn('WB stock report returned empty result, falling back to legacy supplier endpoint');
      }
      
      // Fallback на legacy API
      if (this.legacyClient) {
        const legacyStock = await this.fetchLegacyStock();
        return legacyStock;
      }
      
      throw new BadRequestException('No available API clients for stock fetching');
    } catch (error) {
      const status = error?.response?.status;
      const isAuthError = status === 401 || status === 403;
      
      if (isAuthError) {
        // Если это ошибка авторизации, возвращаем пустой массив вместо падения
        // Это может быть из-за ограниченных прав доступа к stock API
        this.logger.warn(`Stock API access denied (${status}). This may be due to limited API token permissions. Returning empty stock data.`);
        return [];
      }
      
      this.logger.warn(`Failed to fetch stock via reports API (${error.message}). Trying legacy endpoint...`);
      
      // Пытаемся использовать legacy API как fallback
      if (this.legacyClient) {
        try {
          const fallbackStock = await this.fetchLegacyStock();
          return fallbackStock;
        } catch (fallbackError) {
          const fallbackStatus = fallbackError?.response?.status;
          const isFallbackAuthError = fallbackStatus === 401 || fallbackStatus === 403;
          
          if (isFallbackAuthError) {
            this.logger.warn(`Legacy stock API also access denied (${fallbackStatus}). Returning empty stock data.`);
            return [];
          }
          
          this.logger.error(`Legacy stock API also failed: ${fallbackError.message}`);
          // Для некритичных ошибок возвращаем пустой массив вместо падения
          this.logger.warn('Returning empty stock data due to API errors');
          return [];
        }
      }
      
      // Для некритичных ошибок возвращаем пустой массив
      this.logger.warn(`Returning empty stock data due to error: ${error.message}`);
      return [];
    }
  }

  async getOrders(params?: OrdersParams): Promise<OrderData[]> {
    if (!this.analyticsClient) {
      throw new BadRequestException('Wildberries API client not initialized. Call connect() first.');
    }
    try {
      const dateFrom = params?.startDate
        ? params.startDate.toISOString().split('T')[0]
        : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const dateTo = params?.endDate
        ? params.endDate.toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0];

      const orders = await this.fetchOrdersFromAnalytics(dateFrom, dateTo, params);
      if (orders.length > 0) {
        return orders;
      }

      this.logger.warn('WB analytics orders response is empty, falling back to legacy supplier endpoint');
      const legacyOrders = await this.fetchLegacyOrders(dateFrom, dateTo, params);
      return legacyOrders;
    } catch (error) {
      this.logger.warn(`Failed to fetch orders via analytics API (${error.message}). Trying legacy endpoint...`);
      const legacyOrders = await this.fetchLegacyOrders(
        params?.startDate
          ? params.startDate.toISOString().split('T')[0]
          : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        params?.endDate ? params.endDate.toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        params,
      );
      return legacyOrders;
    }
  }

  async getOrderById(orderId: string): Promise<OrderData> {
    try {
      const orders = await this.getOrders();
      const order = orders.find((o) => o.id === orderId || o.orderNumber === orderId);
      
      if (!order) {
        throw new BadRequestException(`Order with ID ${orderId} not found`);
      }

      return order;
    } catch (error) {
      throw new BadRequestException(`Failed to get order: ${error.message}`);
    }
  }

  async getAdCampaigns(params?: AdCampaignsParams): Promise<AdCampaignData[]> {
    if (!this.advertClient) {
      return [];
    }
    try {
      const campaigns = await this.fetchAdvertCampaigns(params);
      if (campaigns.length > 0) {
        return campaigns;
      }

      this.logger.warn('WB promotion API returned empty list, falling back to legacy supplier adverts endpoint');
      const legacyCampaigns = await this.fetchLegacyAdCampaigns(params);
      return legacyCampaigns;
    } catch (error) {
      const status = error?.response?.status;
      const isAuthError = status === 401 || status === 403;
      
      if (isAuthError) {
        // Если это ошибка авторизации, возвращаем пустой массив
        this.logger.warn(`Ad campaigns API access denied (${status}). This may be due to limited API token permissions. Returning empty campaigns list.`);
        return [];
      }
      
      this.logger.warn(`Failed to fetch ad campaigns via promotion API (${error.message}). Using legacy fallback...`);
      try {
        const legacyCampaigns = await this.fetchLegacyAdCampaigns(params);
        return legacyCampaigns;
      } catch (legacyError) {
        const legacyStatus = legacyError?.response?.status;
        const isLegacyAuthError = legacyStatus === 401 || legacyStatus === 403;
        
        if (isLegacyAuthError) {
          this.logger.warn(`Legacy ad campaigns API also access denied (${legacyStatus}). Returning empty campaigns list.`);
          return [];
        }
        
        this.logger.warn(`Legacy ad campaigns API also failed: ${legacyError.message}. Returning empty campaigns list.`);
        return [];
      }
    }
  }

  async getAdStatistics(campaignId: string, params?: AdStatisticsParams): Promise<AdStatisticsData> {
    if (!this.advertClient) {
      this.logger.warn('Wildberries advert API client not initialized. Returning empty statistics.');
      return this.normalizeAdStatisticsData({}, campaignId);
    }
    try {
      const stats = await this.fetchAdvertStatistics(campaignId, params);
      return stats;
    } catch (error) {
      const status = error?.response?.status;
      const isAuthError = status === 401 || status === 403;
      const isTimeout = error.code === 'ECONNABORTED' || error.message?.includes('timeout');
      
      if (isAuthError) {
        this.logger.warn(`Ad statistics API access denied (${status}). Returning empty statistics.`);
        return this.normalizeAdStatisticsData({}, campaignId);
      }
      
      if (isTimeout) {
        this.logger.warn(`Ad statistics request timeout for campaign ${campaignId}. Returning empty statistics.`);
        return this.normalizeAdStatisticsData({}, campaignId);
      }
      
      this.logger.warn(`Failed to fetch advert statistics via promotion API (${error.message}). Trying legacy endpoint...`);
      try {
        const legacyStats = await this.fetchLegacyAdStatistics(campaignId, params);
        return legacyStats;
      } catch (legacyError) {
        const legacyStatus = legacyError?.response?.status;
        const isLegacyAuthError = legacyStatus === 401 || legacyStatus === 403;
        const isLegacyTimeout = legacyError.code === 'ECONNABORTED' || legacyError.message?.includes('timeout');
        
        if (isLegacyAuthError || isLegacyTimeout) {
          this.logger.warn(`Legacy ad statistics API also failed (${legacyStatus || 'timeout'}). Returning empty statistics.`);
          return this.normalizeAdStatisticsData({}, campaignId);
        }
        
        this.logger.warn(`Legacy ad statistics API also failed: ${legacyError.message}. Returning empty statistics.`);
        return this.normalizeAdStatisticsData({}, campaignId);
      }
    }
  }

  async getRegionalData(params?: RegionalDataParams): Promise<RegionalData[]> {
    try {
      const sales = await this.getSales({
        startDate: params?.startDate,
        endDate: params?.endDate,
      });

      // Группируем по регионам
      const regionalMap = new Map<string, RegionalData>();

      sales.forEach((sale) => {
        const region = sale.region || 'Не указан';
        if (!regionalMap.has(region)) {
          regionalMap.set(region, {
            region,
            ordersCount: 0,
            totalAmount: 0,
            averageOrderValue: 0,
            topProducts: [],
          });
        }

        const data = regionalMap.get(region);
        data.ordersCount += 1;
        data.totalAmount += sale.totalAmount;
      });

      // Вычисляем средний чек и топ товары
      const result = Array.from(regionalMap.values()).map((data) => {
        data.averageOrderValue = data.totalAmount / data.ordersCount;
        return data;
      });

      return result;
    } catch (error) {
      throw new BadRequestException(`Failed to get regional data: ${error.message}`);
    }
  }

  private async fetchSalesFromAnalytics(
    dateFrom: string,
    dateTo: string,
    params: SalesParams,
  ): Promise<SalesData[]> {
    if (!this.analyticsClient) {
      return [];
    }

    const payload: any = {
      page: 1,
      size: params?.limit || 500,
      dateFrom,
      dateTo,
    };

    if (params?.productId) {
      payload.nmIDs = [Number(params.productId)];
    }

    const response = await this.requestWithRetry(
      () =>
        this.analyticsClient.post('/api/analytics/v3/sales-funnel/products/history', payload),
      'Failed to get analytics sales',
    );

    const raw = response?.data?.data ?? response?.data?.history ?? response?.data ?? [];
    const normalized: SalesData[] = [];

    if (!Array.isArray(raw)) {
      return normalized;
    }

    raw.forEach((product) => {
      const productId =
        product?.nmID?.toString() ||
        product?.nmId?.toString() ||
        product?.id?.toString() ||
        params?.productId?.toString() ||
        'unknown';
      const productName =
        product?.subject ||
        product?.name ||
        product?.object ||
        product?.title ||
        'Неизвестный товар';
      const history =
        (Array.isArray(product?.history) && product.history) ||
        (Array.isArray(product?.days) && product.days) ||
        (Array.isArray(product?.statistics) && product.statistics) ||
        [];

      if (history.length === 0) {
        const quantity = product?.orders ?? product?.sales ?? product?.soldUnits ?? 0;
        const totalAmount = product?.revenue ?? product?.sum ?? product?.gmv ?? quantity;
        normalized.push({
          id: `${productId}-${dateFrom}`,
          productId,
          productName,
          quantity,
          price: product?.price ?? product?.avgPrice ?? (quantity ? totalAmount / quantity : 0),
          totalAmount,
          date: new Date(dateFrom),
          region: undefined,
        });
        return;
      }

      history.forEach((point, index) => {
        const quantity = point?.orders ?? point?.sales ?? point?.soldUnits ?? point?.quantity ?? 0;
        const amount = point?.revenue ?? point?.sum ?? point?.gmv ?? (point?.price ?? 0) * quantity;
        normalized.push({
          id: `${productId}-${point?.dt || point?.date || point?.period || index}`,
          productId,
          productName,
          quantity,
          price: point?.price ?? point?.avgPrice ?? (quantity ? amount / quantity : 0),
          totalAmount: amount,
          date: new Date(point?.dt || point?.date || point?.period || dateFrom),
          region: point?.region,
          orderId: point?.orderId,
        });
      });
    });

    return normalized;
  }

  private async fetchLegacySales(
    dateFrom: string,
    dateTo: string,
    params: SalesParams,
  ): Promise<SalesData[]> {
    if (!this.legacyClient) {
      return [];
    }

    const sales = await this.fetchByWindows(
      (windowStart, windowEnd) =>
        this.legacyClient.get('/api/v1/supplier/sales', {
          params: {
            dateFrom: windowStart,
            dateTo: windowEnd,
            limit: params?.limit || MAX_WINDOW_LIMIT,
          },
        }),
      dateFrom,
      dateTo,
      'Failed to get sales',
    );

    return this.normalizeSalesData(sales);
  }

  private async fetchStockFromReports(params?: StockParams): Promise<StockData[]> {
    if (!this.analyticsClient) {
      this.logger.warn('Analytics client not initialized, cannot fetch stock from reports');
      return [];
    }

    const extendedParams = (params as StockParams & { limit?: number }) || {};
    const payload: any = {
      page: 1,
      size: extendedParams?.limit && extendedParams.limit > 0 ? extendedParams.limit : 100,
    };

    if (params?.productId) {
      payload.nmIDs = [Number(params.productId)];
    }

    const response = await this.requestWithRetry(
      () =>
        this.analyticsClient.post('/api/v2/stocks-report/products/products', payload),
      'Failed to get stock reports',
    );

    const data = response?.data?.data ?? response?.data?.stocks ?? response?.data ?? [];
    if (!Array.isArray(data)) {
      return [];
    }

    return data.map((row) => {
      const quantity =
        row?.quantity ??
        row?.stocks ??
        row?.stock ??
        row?.freeQty ??
        0;
      const reserved =
        row?.inWayToClient ??
        row?.reserved ??
        row?.inWayToWarehouse ??
        0;
      return {
        productId: row?.nmID?.toString() || row?.nmId?.toString() || row?.id?.toString(),
        productName: row?.subject || row?.name || row?.title || 'Неизвестный товар',
        warehouseId: row?.warehouseId?.toString(),
        warehouseName: row?.warehouseName,
        quantity,
        reservedQuantity: reserved,
        availableQuantity: quantity - reserved,
      };
    });
  }

  private async fetchLegacyStock(): Promise<StockData[]> {
    if (!this.legacyClient) {
      this.logger.warn('Legacy client not initialized, cannot fetch stock from legacy endpoint');
      throw new BadRequestException('Legacy API client not initialized');
    }

    const response = await this.requestWithRetry(
      () =>
        this.legacyClient.get('/api/v1/supplier/stocks', {
          params: {
            dateFrom: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
              .toISOString()
              .split('T')[0],
          },
        }),
      'Failed to get stock',
    );

    return this.normalizeStockData(response?.data ?? []);
  }

  private async fetchOrdersFromAnalytics(
    dateFrom: string,
    dateTo: string,
    params?: OrdersParams,
  ): Promise<OrderData[]> {
    const salesParams: SalesParams = {
      startDate: params?.startDate ?? new Date(dateFrom),
      endDate: params?.endDate ?? new Date(dateTo),
      limit: params?.limit,
    };

    const sales = await this.fetchSalesFromAnalytics(dateFrom, dateTo, salesParams);

    return sales.map((sale, index) => ({
      id: sale.orderId || `${sale.productId}-${sale.date.getTime()}-${index}`,
      orderNumber: sale.orderId || `${sale.productId}-${sale.date.getTime()}`,
      date: sale.date,
      status: 'completed',
      totalAmount: sale.totalAmount,
      items: [
        {
          productId: sale.productId,
          productName: sale.productName,
          quantity: sale.quantity,
          price: sale.price,
          totalAmount: sale.totalAmount,
        },
      ],
      region: sale.region,
    }));
  }

  private async fetchLegacyOrders(
    dateFrom: string,
    dateTo: string,
    params?: OrdersParams,
  ): Promise<OrderData[]> {
    if (!this.legacyClient) {
      return [];
    }

    const orders = await this.fetchByWindows(
      (windowStart, windowEnd) =>
        this.legacyClient.get('/api/v1/supplier/orders', {
          params: {
            dateFrom: windowStart,
            dateTo: windowEnd,
            limit: params?.limit || MAX_WINDOW_LIMIT,
          },
        }),
      dateFrom,
      dateTo,
      'Failed to get orders',
    );

    return this.normalizeOrdersData(orders);
  }

  private async fetchAdvertCampaigns(params?: AdCampaignsParams): Promise<AdCampaignData[]> {
    if (!this.advertClient) {
      return [];
    }

    const summary = await this.requestWithRetry(
      () =>
        this.advertClient.get('/adv/v1/promotion/count', {
          params: {
            status: params?.status,
          },
        }),
      'Failed to get promotion summary',
      2,
    );

    const groups = summary?.data?.adverts ?? [];
    if (!Array.isArray(groups)) {
      return [];
    }

    const ids = groups.flatMap((group) => group?.ids ?? group?.adverts ?? []);
    if (!Array.isArray(ids) || ids.length === 0) {
      return [];
    }

    const details: any[] = [];
    for (let i = 0; i < ids.length; i += 50) {
      const batch = ids.slice(i, i + 50);
      const batchResponse = await this.requestWithRetry(
        () =>
          this.advertClient.post('/adv/v1/promotion/adverts', batch, {
            params: {
              status: params?.status,
            },
          }),
        'Failed to get promotion adverts',
        2,
      );

      if (Array.isArray(batchResponse?.data)) {
        details.push(...batchResponse.data);
      }
    }

    return this.normalizeAdCampaignsData(details);
  }

  private async fetchLegacyAdCampaigns(params?: AdCampaignsParams): Promise<AdCampaignData[]> {
    if (!this.legacyClient) {
      return [];
    }

    const response = await this.requestWithRetry(
      () =>
        this.legacyClient.get('/api/v1/supplier/adverts', {
          params: {
            status: params?.status,
          },
        }),
      'Failed to get ad campaigns (legacy)',
      2,
    );

    return this.normalizeAdCampaignsData(response?.data ?? []);
  }

  private async fetchAdvertStatistics(
    campaignId: string,
    params?: AdStatisticsParams,
  ): Promise<AdStatisticsData> {
    if (!this.advertClient) {
      return this.normalizeAdStatisticsData({}, campaignId);
    }

    const beginDate =
      params?.startDate?.toISOString().split('T')[0] ||
      new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const endDate = params?.endDate?.toISOString().split('T')[0] || new Date().toISOString().split('T')[0];

    const response = await this.requestWithRetry(
      () =>
        this.advertClient.get('/adv/v3/fullstats', {
          params: {
            ids: campaignId,
            beginDate,
            endDate,
          },
        }),
      'Failed to get advert statistics',
      2,
    );

    const statsEntry = Array.isArray(response?.data) ? response.data[0] : response?.data;
    return this.normalizeAdStatisticsData(statsEntry || {}, campaignId);
  }

  private async fetchLegacyAdStatistics(
    campaignId: string,
    params?: AdStatisticsParams,
  ): Promise<AdStatisticsData> {
    if (!this.legacyClient) {
      return this.normalizeAdStatisticsData({}, campaignId);
    }

    const response = await this.requestWithRetry(
      () =>
        this.legacyClient.get(`/api/v1/supplier/adverts/${campaignId}/statistics`, {
          params: {
            dateFrom: params?.startDate?.toISOString().split('T')[0],
            dateTo: params?.endDate?.toISOString().split('T')[0],
          },
        }),
      'Failed to get advert statistics (legacy)',
      2,
    );

    return this.normalizeAdStatisticsData(response?.data || {}, campaignId);
  }

  // Методы нормализации данных
  private normalizeSalesData(data: any[]): SalesData[] {
    return data.map((item) => ({
      id: item.saleID || item.id,
      productId: item.nmId?.toString() || item.productId,
      productName: item.subject || item.productName || 'Неизвестный товар',
      quantity: item.quantity || 1,
      price: item.price || 0,
      totalAmount: (item.price || 0) * (item.quantity || 1),
      date: new Date(item.date || item.sale_dt),
      region: item.regionName || item.region,
      orderId: item.orderId || item.gNumber,
    }));
  }

  private normalizeProductsData(data: any[]): ProductData[] {
    return data.map((card) => {
      const sizes = Array.isArray(card.sizes) ? card.sizes : [];
      const stocks = sizes.flatMap((size) =>
        Array.isArray(size.stocks) ? size.stocks : [],
      );
      const totalStock = stocks.reduce((sum, stock) => sum + (stock.qty ?? 0), 0);
      const barcodes = sizes.flatMap((size) => {
        if (Array.isArray(size.skus)) {
          return size.skus;
        }
        if (Array.isArray(size.barcodes)) {
          return size.barcodes;
        }
        return [];
      });
      const photos = Array.isArray(card.photos)
        ? card.photos
            .map((photo) => photo.big || photo.c246x328 || photo.s246x328)
            .filter(Boolean)
        : [];
      const rawPrice =
        sizes[0]?.price?.basic ??
        sizes[0]?.price ??
        card.price ??
        card.salePriceU ??
        0;
      const price =
        typeof rawPrice === 'number'
          ? rawPrice > 0 && rawPrice > 10_000
            ? rawPrice / 100
            : rawPrice
          : 0;

      return {
        id: card.nmID?.toString() || card.imtID?.toString(),
        name: card.title || card.object || card.subjectName || 'Неизвестный товар',
        sku: card.vendorCode || card.article || '',
        barcode: barcodes[0],
        category: card.subjectName || card.object,
        price,
        stock: totalStock,
        images: photos,
        description: card.description,
      };
    });
  }

  private normalizeStockData(data: any[]): StockData[] {
    return data.map((item) => ({
      productId: item.nmId?.toString() || item.productId,
      productName: item.subject || item.productName || 'Неизвестный товар',
      warehouseId: item.warehouseName || item.warehouseId,
      warehouseName: item.warehouseName,
      quantity: item.quantity || 0,
      reservedQuantity: item.inWayToClient || 0,
      availableQuantity: (item.quantity || 0) - (item.inWayToClient || 0),
    }));
  }

  private normalizeOrdersData(data: any[]): OrderData[] {
    return data.map((item) => ({
      id: item.orderId || item.id,
      orderNumber: item.gNumber || item.orderNumber,
      date: new Date(item.date || item.order_dt),
      status: item.orderType || item.status || 'new',
      totalAmount: item.totalPrice || 0,
      items: [
        {
          productId: item.nmId?.toString() || item.productId,
          productName: item.subject || item.productName,
          quantity: item.quantity || 1,
          price: item.price || 0,
          totalAmount: (item.price || 0) * (item.quantity || 1),
        },
      ],
      region: item.regionName || item.region,
    }));
  }

  private normalizeAdCampaignsData(data: any[]): AdCampaignData[] {
    return data.map((item) => ({
      id: item.advertId?.toString() || item.id,
      name: item.advertName || item.name,
      status: item.status || 'active',
      budget: item.dailyBudget || item.budget,
      spent: item.sum || 0,
      startDate: item.startDate ? new Date(item.startDate) : null,
      endDate: item.endDate ? new Date(item.endDate) : null,
    }));
  }

  private normalizeAdStatisticsData(data: any, campaignId: string): AdStatisticsData {
    return {
      campaignId,
      impressions: data.views || 0,
      clicks: data.clicks || 0,
      conversions: data.orders || 0,
      spent: data.sum || 0,
      revenue: data.sum || 0,
      roi: data.orders > 0 ? (data.sum / data.orders) : 0,
    };
  }

  private async requestWithRetry<T>(
    request: () => Promise<T>,
    context: string,
    maxRetries: number = MAX_RETRIES,
  ): Promise<T> {
    let attempt = 0;

    while (true) {
      await this.waitForRateLimit();
      try {
        const response = await request();
        this.lastRequestAt = Date.now();
        return response;
      } catch (error) {
        this.lastRequestAt = Date.now();
        const status = error?.response?.status;
        if (status === 429 && attempt < maxRetries) {
          const pause = WB_RATE_LIMIT_INTERVAL_MS * (attempt + 1);
          this.logger.warn(
            `${context}: rate limit reached (attempt ${attempt + 1}). Retrying in ${pause}ms`,
          );
          await this.delay(pause);
          attempt += 1;
          continue;
        }

        throw new BadRequestException(`${context}: ${error.message}`);
      }
    }
  }

  private async fetchByWindows(
    request: (windowStart: string, windowEnd: string) => Promise<any>,
    dateFrom: string,
    dateTo: string,
    context: string,
  ): Promise<any[]> {
    const windows = this.buildDateWindows(dateFrom, dateTo);
    const aggregated: any[] = [];

    for (const window of windows) {
      const response = await this.requestWithRetry(
        () => request(window.start, window.end),
        context,
      );
      aggregated.push(...response.data);
    }

    return aggregated;
  }

  private buildDateWindows(start: string, end: string) {
    const windows = [];
    let cursor = new Date(start);
    const endDate = new Date(end);

    while (cursor <= endDate) {
      const windowEnd = new Date(cursor);
      windowEnd.setDate(windowEnd.getDate() + WB_WINDOW_DAYS - 1);
      if (windowEnd > endDate) {
        windowEnd.setTime(endDate.getTime());
      }

      windows.push({
        start: cursor.toISOString().split('T')[0],
        end: windowEnd.toISOString().split('T')[0],
      });

      cursor.setDate(cursor.getDate() + WB_WINDOW_DAYS);
    }

    return windows;
  }

  private async waitForRateLimit() {
    const now = Date.now();
    const elapsed = now - this.lastRequestAt;

    if (this.lastRequestAt === 0 || elapsed >= WB_RATE_LIMIT_INTERVAL_MS) {
      return;
    }

    await this.delay(WB_RATE_LIMIT_INTERVAL_MS - elapsed);
  }

  private async delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

