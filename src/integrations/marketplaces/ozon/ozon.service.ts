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
export class OzonService implements IMarketplaceIntegration {
  private apiClient: AxiosInstance;
  private credentials: MarketplaceCredentials;
  private baseURL = 'https://api-seller.ozon.ru';

  async connect(credentials: MarketplaceCredentials): Promise<boolean> {
    this.credentials = credentials;
    
    if (!credentials.apiKey || !credentials.apiSecret) {
      throw new BadRequestException('API key and secret are required for Ozon');
    }

    this.apiClient = axios.create({
      baseURL: this.baseURL,
      headers: {
        'Client-Id': credentials.apiKey,
        'Api-Key': credentials.apiSecret,
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
      await this.apiClient.post('/v1/product/info/list', {
        product_id: [],
      });
      return true;
    } catch (error) {
      throw new BadRequestException(`Ozon connection failed: ${error.message}`);
    }
  }

  async getSales(params: SalesParams): Promise<SalesData[]> {
    try {
      const dateFrom = params.startDate
        ? Math.floor(params.startDate.getTime() / 1000)
        : Math.floor((Date.now() - 7 * 24 * 60 * 60 * 1000) / 1000);
      const dateTo = params.endDate
        ? Math.floor(params.endDate.getTime() / 1000)
        : Math.floor(Date.now() / 1000);

      const response = await this.apiClient.post('/v3/finance/transaction/list', {
        filter: {
          date: {
            from: dateFrom.toString(),
            to: dateTo.toString(),
          },
          operation_type: ['operation-agent-delivery-to-customer', 'operation-delivery-to-customer'],
        },
        page: 1,
        page_size: params.limit || 1000,
      });

      return this.normalizeSalesData(response.data.result?.operations || []);
    } catch (error) {
      throw new BadRequestException(`Failed to get sales: ${error.message}`);
    }
  }

  async getSalesByDateRange(startDate: Date, endDate: Date): Promise<SalesData[]> {
    return this.getSales({ startDate, endDate });
  }

  async getProducts(params?: ProductsParams): Promise<ProductData[]> {
    try {
      const response = await this.apiClient.post('/v2/product/list', {
        filter: {},
        last_id: '',
        limit: params?.limit || 1000,
      });

      return this.normalizeProductsData(response.data.result?.items || []);
    } catch (error) {
      throw new BadRequestException(`Failed to get products: ${error.message}`);
    }
  }

  async getProductById(productId: string): Promise<ProductData> {
    try {
      const response = await this.apiClient.post('/v2/product/info', {
        product_id: productId,
      });

      return this.normalizeProductData(response.data.result);
    } catch (error) {
      throw new BadRequestException(`Failed to get product: ${error.message}`);
    }
  }

  async getStock(params?: StockParams): Promise<StockData[]> {
    try {
      const response = await this.apiClient.post('/v3/product/info/stocks', {
        filter: {},
        last_id: '',
        limit: 1000,
      });

      return this.normalizeStockData(response.data.result?.items || []);
    } catch (error) {
      throw new BadRequestException(`Failed to get stock: ${error.message}`);
    }
  }

  async getOrders(params?: OrdersParams): Promise<OrderData[]> {
    try {
      const dateFrom = params?.startDate
        ? params.startDate.toISOString()
        : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const dateTo = params?.endDate
        ? params.endDate.toISOString()
        : new Date().toISOString();

      const response = await this.apiClient.post('/v3/posting/fbs/list', {
        filter: {
          since: dateFrom,
          to: dateTo,
          status: params?.status || '',
        },
        limit: params?.limit || 1000,
      });

      return this.normalizeOrdersData(response.data.result || []);
    } catch (error) {
      throw new BadRequestException(`Failed to get orders: ${error.message}`);
    }
  }

  async getOrderById(orderId: string): Promise<OrderData> {
    try {
      const response = await this.apiClient.post('/v3/posting/fbs/get', {
        posting_number: orderId,
      });

      return this.normalizeOrderData(response.data.result);
    } catch (error) {
      throw new BadRequestException(`Failed to get order: ${error.message}`);
    }
  }

  async getAdCampaigns(params?: AdCampaignsParams): Promise<AdCampaignData[]> {
    try {
      const response = await this.apiClient.post('/v1/performance/campaign/list', {
        filter: {
          status: params?.status || 'all',
        },
      });

      return this.normalizeAdCampaignsData(response.data.result || []);
    } catch (error) {
      return [];
    }
  }

  async getAdStatistics(campaignId: string, params?: AdStatisticsParams): Promise<AdStatisticsData> {
    try {
      const response = await this.apiClient.post('/v1/performance/statistics', {
        campaign_id: campaignId,
        date_from: params?.startDate?.toISOString(),
        date_to: params?.endDate?.toISOString(),
      });

      return this.normalizeAdStatisticsData(response.data.result, campaignId);
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

  private normalizeSalesData(data: any[]): SalesData[] {
    return data.map((item) => ({
      id: item.operation_id || item.id,
      productId: item.product_id?.toString() || item.productId,
      productName: item.product_name || item.productName || 'Неизвестный товар',
      quantity: item.quantity || 1,
      price: item.price || 0,
      totalAmount: item.amount || (item.price || 0) * (item.quantity || 1),
      date: new Date(item.operation_date || item.date),
      region: item.region || item.delivery_region_name,
      orderId: item.posting_number || item.orderId,
    }));
  }

  private normalizeProductsData(data: any[]): ProductData[] {
    return data.map((item) => ({
      id: item.product_id?.toString() || item.id,
      name: item.offer_id || item.name || 'Неизвестный товар',
      sku: item.sku?.toString() || item.offer_id || '',
      barcode: item.barcode,
      category: item.category_name || item.category,
      price: item.price || 0,
      stock: item.stocks?.find((s: any) => s.present)?.present || 0,
      images: item.images || [],
      description: item.description,
    }));
  }

  private normalizeProductData(item: any): ProductData {
    return {
      id: item.product_id?.toString() || item.id,
      name: item.offer_id || item.name || 'Неизвестный товар',
      sku: item.sku?.toString() || item.offer_id || '',
      barcode: item.barcode,
      category: item.category_name || item.category,
      price: item.price || 0,
      stock: item.stocks?.find((s: any) => s.present)?.present || 0,
      images: item.images || [],
      description: item.description,
    };
  }

  private normalizeStockData(data: any[]): StockData[] {
    return data.map((item) => ({
      productId: item.product_id?.toString() || item.productId,
      productName: item.offer_id || item.productName || 'Неизвестный товар',
      warehouseId: item.warehouse_name || item.warehouseId,
      warehouseName: item.warehouse_name,
      quantity: item.present || 0,
      reservedQuantity: item.reserved || 0,
      availableQuantity: (item.present || 0) - (item.reserved || 0),
    }));
  }

  private normalizeOrdersData(data: any[]): OrderData[] {
    return data.map((item) => ({
      id: item.posting_number || item.id,
      orderNumber: item.order_number || item.posting_number,
      date: new Date(item.created_at || item.date),
      status: item.status || 'new',
      totalAmount: item.total_delivery_amount || 0,
      items: (item.products || []).map((product: any) => ({
        productId: product.product_id?.toString() || product.productId,
        productName: product.offer_id || product.productName,
        quantity: product.quantity || 1,
        price: product.price || 0,
        totalAmount: (product.price || 0) * (product.quantity || 1),
      })),
      region: item.delivery_region || item.region,
    }));
  }

  private normalizeOrderData(item: any): OrderData {
    return {
      id: item.posting_number || item.id,
      orderNumber: item.order_number || item.posting_number,
      date: new Date(item.created_at || item.date),
      status: item.status || 'new',
      totalAmount: item.total_delivery_amount || 0,
      items: (item.products || []).map((product: any) => ({
        productId: product.product_id?.toString() || product.productId,
        productName: product.offer_id || product.productName,
        quantity: product.quantity || 1,
        price: product.price || 0,
        totalAmount: (product.price || 0) * (product.quantity || 1),
      })),
      region: item.delivery_region || item.region,
    };
  }

  private normalizeAdCampaignsData(data: any[]): AdCampaignData[] {
    return data.map((item) => ({
      id: item.campaign_id?.toString() || item.id,
      name: item.campaign_name || item.name,
      status: item.status || 'active',
      budget: item.daily_budget || item.budget,
      spent: item.spent || 0,
      startDate: item.start_date ? new Date(item.start_date) : null,
      endDate: item.end_date ? new Date(item.end_date) : null,
    }));
  }

  private normalizeAdStatisticsData(data: any, campaignId: string): AdStatisticsData {
    return {
      campaignId,
      impressions: data.impressions || 0,
      clicks: data.clicks || 0,
      conversions: data.orders || 0,
      spent: data.spent || 0,
      revenue: data.revenue || 0,
      roi: data.orders > 0 ? (data.revenue / data.spent) : 0,
    };
  }
}

