import { Injectable, BadRequestException } from '@nestjs/common';
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
export class YandexMarketService implements IMarketplaceIntegration {
  private apiClient: AxiosInstance;
  private credentials: MarketplaceCredentials;
  private baseURL = 'https://api.partner.market.yandex.ru';

  async connect(credentials: MarketplaceCredentials): Promise<boolean> {
    this.credentials = credentials;
    
    if (!credentials.token) {
      throw new BadRequestException('OAuth token is required for Yandex Market');
    }

    this.apiClient = axios.create({
      baseURL: this.baseURL,
      headers: {
        'Authorization': `OAuth ${credentials.token}`,
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
      await this.apiClient.get('/campaigns');
      return true;
    } catch (error) {
      throw new BadRequestException(`Yandex Market connection failed: ${error.message}`);
    }
  }

  async getSales(params: SalesParams): Promise<SalesData[]> {
    try {
      // Yandex Market API для продаж
      const response = await this.apiClient.get('/campaigns', {
        params: {
          page: 1,
          pageSize: params.limit || 1000,
        },
      });

      // Получаем ID кампаний
      const campaignIds = response.data.campaigns?.map((c: any) => c.id) || [];

      // Для каждой кампании получаем заказы
      const allSales: SalesData[] = [];
      for (const campaignId of campaignIds) {
        const ordersResponse = await this.apiClient.get(`/campaigns/${campaignId}/orders`, {
          params: {
            status: 'DELIVERY',
            fromDate: params.startDate?.toISOString(),
            toDate: params.endDate?.toISOString(),
          },
        });

        const sales = this.normalizeSalesData(ordersResponse.data.orders || [], campaignId);
        allSales.push(...sales);
      }

      return allSales;
    } catch (error) {
      throw new BadRequestException(`Failed to get sales: ${error.message}`);
    }
  }

  async getSalesByDateRange(startDate: Date, endDate: Date): Promise<SalesData[]> {
    return this.getSales({ startDate, endDate });
  }

  async getProducts(params?: ProductsParams): Promise<ProductData[]> {
    try {
      const response = await this.apiClient.get('/campaigns');
      const campaignIds = response.data.campaigns?.map((c: any) => c.id) || [];

      if (campaignIds.length === 0) {
        return [];
      }

      // Получаем товары из первой кампании (можно расширить для всех)
      const campaignId = campaignIds[0];
      const productsResponse = await this.apiClient.get(`/campaigns/${campaignId}/offer-mapping-entries`, {
        params: {
          limit: params?.limit || 1000,
          offset: params?.offset || 0,
        },
      });

      return this.normalizeProductsData(productsResponse.data.result?.offerMappingEntries || []);
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
      const response = await this.apiClient.get('/campaigns');
      const campaignIds = response.data.campaigns?.map((c: any) => c.id) || [];

      if (campaignIds.length === 0) {
        return [];
      }

      const campaignId = campaignIds[0];
      const stockResponse = await this.apiClient.get(`/campaigns/${campaignId}/offers/stats`, {
        params: {
          limit: 1000,
        },
      });

      return this.normalizeStockData(stockResponse.data.result?.offerStats || []);
    } catch (error) {
      throw new BadRequestException(`Failed to get stock: ${error.message}`);
    }
  }

  async getOrders(params?: OrdersParams): Promise<OrderData[]> {
    try {
      const response = await this.apiClient.get('/campaigns');
      const campaignIds = response.data.campaigns?.map((c: any) => c.id) || [];

      const allOrders: OrderData[] = [];
      for (const campaignId of campaignIds) {
        const ordersResponse = await this.apiClient.get(`/campaigns/${campaignId}/orders`, {
          params: {
            status: params?.status || 'PROCESSING',
            fromDate: params?.startDate?.toISOString(),
            toDate: params?.endDate?.toISOString(),
            limit: params?.limit || 1000,
          },
        });

        const orders = this.normalizeOrdersData(ordersResponse.data.orders || [], campaignId);
        allOrders.push(...orders);
      }

      return allOrders;
    } catch (error) {
      throw new BadRequestException(`Failed to get orders: ${error.message}`);
    }
  }

  async getOrderById(orderId: string): Promise<OrderData> {
    try {
      const response = await this.apiClient.get('/campaigns');
      const campaignIds = response.data.campaigns?.map((c: any) => c.id) || [];

      for (const campaignId of campaignIds) {
        try {
          const orderResponse = await this.apiClient.get(`/campaigns/${campaignId}/orders/${orderId}`);
          return this.normalizeOrderData(orderResponse.data.order, campaignId);
        } catch (error) {
          // Продолжаем поиск в других кампаниях
          continue;
        }
      }

      throw new BadRequestException(`Order with ID ${orderId} not found`);
    } catch (error) {
      throw new BadRequestException(`Failed to get order: ${error.message}`);
    }
  }

  async getAdCampaigns(params?: AdCampaignsParams): Promise<AdCampaignData[]> {
    // Yandex Market не имеет встроенной рекламной системы
    return [];
  }

  async getAdStatistics(campaignId: string, params?: AdStatisticsParams): Promise<AdStatisticsData> {
    throw new BadRequestException('Ad statistics not available for Yandex Market');
  }

  async getRegionalData(params?: RegionalDataParams): Promise<RegionalData[]> {
    try {
      const sales = await this.getSales({
        startDate: params?.startDate,
        endDate: params?.endDate,
      });

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

      const result = Array.from(regionalMap.values()).map((data) => {
        data.averageOrderValue = data.totalAmount / data.ordersCount;
        return data;
      });

      return result;
    } catch (error) {
      throw new BadRequestException(`Failed to get regional data: ${error.message}`);
    }
  }

  private normalizeSalesData(data: any[], campaignId?: string): SalesData[] {
    return data
      .filter((item) => item.status === 'DELIVERY' || item.status === 'DELIVERED')
      .map((item) => ({
        id: item.id?.toString() || item.orderId,
        productId: item.items?.[0]?.offerId || item.productId,
        productName: item.items?.[0]?.offerName || item.productName || 'Неизвестный товар',
        quantity: item.items?.reduce((sum: number, i: any) => sum + (i.count || 0), 0) || 1,
        price: item.items?.[0]?.price || 0,
        totalAmount: item.total || item.subtotal || 0,
        date: new Date(item.creationDate || item.date),
        region: item.delivery?.region || item.region,
        orderId: item.id?.toString() || item.orderId,
        campaignId,
      }));
  }

  private normalizeProductsData(data: any[]): ProductData[] {
    return data.map((item) => ({
      id: item.offer?.shopSku || item.id,
      name: item.offer?.name || item.offer?.shopSku || 'Неизвестный товар',
      sku: item.offer?.shopSku || item.sku || '',
      barcode: item.offer?.barcode,
      category: item.offer?.category || item.category,
      price: item.offer?.price || 0,
      stock: item.warehouse?.items?.reduce((sum: number, i: any) => sum + (i.count || 0), 0) || 0,
      images: item.offer?.pictures || [],
      description: item.offer?.description,
    }));
  }

  private normalizeStockData(data: any[]): StockData[] {
    return data.map((item) => ({
      productId: item.offer?.shopSku || item.productId,
      productName: item.offer?.name || item.productName || 'Неизвестный товар',
      warehouseId: item.warehouse?.id || item.warehouseId,
      warehouseName: item.warehouse?.name || item.warehouseName,
      quantity: item.warehouse?.items?.reduce((sum: number, i: any) => sum + (i.count || 0), 0) || 0,
      reservedQuantity: item.warehouse?.items?.reduce((sum: number, i: any) => sum + (i.reserved || 0), 0) || 0,
      availableQuantity: item.warehouse?.items?.reduce((sum: number, i: any) => sum + (i.count || 0) - (i.reserved || 0), 0) || 0,
    }));
  }

  private normalizeOrdersData(data: any[], campaignId?: string): OrderData[] {
    return data.map((item) => ({
      id: item.id?.toString() || item.orderId,
      orderNumber: item.id?.toString() || item.orderNumber,
      date: new Date(item.creationDate || item.date),
      status: item.status || 'new',
      totalAmount: item.total || item.subtotal || 0,
      items: (item.items || []).map((product: any) => ({
        productId: product.offerId || product.productId,
        productName: product.offerName || product.productName,
        quantity: product.count || 1,
        price: product.price || 0,
        totalAmount: (product.price || 0) * (product.count || 1),
      })),
      region: item.delivery?.region || item.region,
      campaignId,
    }));
  }

  private normalizeOrderData(item: any, campaignId?: string): OrderData {
    return {
      id: item.id?.toString() || item.orderId,
      orderNumber: item.id?.toString() || item.orderNumber,
      date: new Date(item.creationDate || item.date),
      status: item.status || 'new',
      totalAmount: item.total || item.subtotal || 0,
      items: (item.items || []).map((product: any) => ({
        productId: product.offerId || product.productId,
        productName: product.offerName || product.productName,
        quantity: product.count || 1,
        price: product.price || 0,
        totalAmount: (product.price || 0) * (product.count || 1),
      })),
      region: item.delivery?.region || item.region,
      campaignId,
    };
  }
}

