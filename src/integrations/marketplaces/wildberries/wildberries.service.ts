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

@Injectable()
export class WildberriesService implements IMarketplaceIntegration {
  private readonly logger = new Logger(WildberriesService.name);
  private apiClient: AxiosInstance;
  private credentials: MarketplaceCredentials;
  private baseURL = 'https://statistics-api.wildberries.ru';

  async connect(credentials: MarketplaceCredentials): Promise<boolean> {
    this.credentials = credentials;
    
    if (!credentials.apiKey) {
      throw new BadRequestException('API key is required for Wildberries');
    }

    this.apiClient = axios.create({
      baseURL: this.baseURL,
      headers: {
        'Authorization': credentials.apiKey,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });

    return this.testConnection();
  }

  async disconnect(): Promise<void> {
    this.apiClient = null;
    this.credentials = null;
  }

  async testConnection(): Promise<boolean> {
    try {
      // Тестовый запрос к API
      await this.apiClient.get('/api/v1/supplier/incomes', {
        params: { dateFrom: new Date().toISOString().split('T')[0] },
      });
      return true;
    } catch (error) {
      throw new BadRequestException(`Wildberries connection failed: ${error.message}`);
    }
  }

  async getSales(params: SalesParams): Promise<SalesData[]> {
    try {
      const dateFrom = params.startDate
        ? params.startDate.toISOString().split('T')[0]
        : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const dateTo = params.endDate
        ? params.endDate.toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0];

      const response = await this.requestWithRetry(
        () =>
          this.apiClient.get('/api/v1/supplier/sales', {
            params: {
              dateFrom,
              dateTo,
              limit: params.limit || 1000,
            },
          }),
        'Failed to get sales',
      );

      return this.normalizeSalesData(response.data);
    } catch (error) {
      throw new BadRequestException(`Failed to get sales: ${error.message}`);
    }
  }

  async getSalesByDateRange(startDate: Date, endDate: Date): Promise<SalesData[]> {
    return this.getSales({ startDate, endDate });
  }

  async getProducts(params?: ProductsParams): Promise<ProductData[]> {
    try {
      const response = await this.requestWithRetry(
        () =>
          this.apiClient.get('/api/v1/supplier/info', {
            params: {
              limit: params?.limit || 1000,
              offset: params?.offset || 0,
            },
          }),
        'Failed to get products',
      );

      return this.normalizeProductsData(response.data);
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
    try {
      const response = await this.requestWithRetry(
        () =>
          this.apiClient.get('/api/v1/supplier/stocks', {
            params: {
              dateFrom: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
                .toISOString()
                .split('T')[0],
            },
          }),
        'Failed to get stock',
      );

      return this.normalizeStockData(response.data);
    } catch (error) {
      throw new BadRequestException(`Failed to get stock: ${error.message}`);
    }
  }

  async getOrders(params?: OrdersParams): Promise<OrderData[]> {
    try {
      const dateFrom = params?.startDate
        ? params.startDate.toISOString().split('T')[0]
        : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const dateTo = params?.endDate
        ? params.endDate.toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0];

      const response = await this.requestWithRetry(
        () =>
          this.apiClient.get('/api/v1/supplier/orders', {
            params: {
              dateFrom,
              dateTo,
              limit: params?.limit || 1000,
            },
          }),
        'Failed to get orders',
      );

      return this.normalizeOrdersData(response.data);
    } catch (error) {
      throw new BadRequestException(`Failed to get orders: ${error.message}`);
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
    try {
      // Wildberries API для рекламы может отличаться
      const response = await this.requestWithRetry(
        () =>
          this.apiClient.get('/api/v1/supplier/adverts', {
            params: {
              status: params?.status,
            },
          }),
        'Failed to get ad campaigns',
        2,
      );

      return this.normalizeAdCampaignsData(response.data);
    } catch (error) {
      // Если API недоступен, возвращаем пустой массив
      return [];
    }
  }

  async getAdStatistics(campaignId: string, params?: AdStatisticsParams): Promise<AdStatisticsData> {
    try {
      const response = await this.requestWithRetry(
        () =>
          this.apiClient.get(`/api/v1/supplier/adverts/${campaignId}/statistics`, {
            params: {
              dateFrom: params?.startDate?.toISOString().split('T')[0],
              dateTo: params?.endDate?.toISOString().split('T')[0],
            },
          }),
        'Failed to get ad statistics',
        2,
      );

      return this.normalizeAdStatisticsData(response.data, campaignId);
    } catch (error) {
      throw new BadRequestException(`Failed to get ad statistics: ${error.message}`);
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
    return data.map((item) => ({
      id: item.nmId?.toString() || item.id,
      name: item.subject || item.name || 'Неизвестный товар',
      sku: item.supplierArticle || item.sku || '',
      barcode: item.barcode,
      category: item.category || item.categoryName,
      price: item.price || 0,
      stock: item.quantity || 0,
      images: item.images || [],
      description: item.description,
    }));
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
    maxRetries: number = 3,
  ): Promise<T> {
    let attempt = 0;
    let delayMs = 1500;

    while (true) {
      try {
        return await request();
      } catch (error) {
        const status = error?.response?.status;
        if (status === 429 && attempt < maxRetries) {
          this.logger.warn(
            `${context}: rate limit reached (attempt ${attempt + 1}). Retrying in ${delayMs}ms`,
          );
          await this.delay(delayMs);
          attempt += 1;
          delayMs *= 2;
          continue;
        }

        throw new BadRequestException(`${context}: ${error.message}`);
      }
    }
  }

  private async delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

