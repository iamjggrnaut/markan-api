export interface IMarketplaceIntegration {
  // Подключение
  connect(credentials: MarketplaceCredentials): Promise<boolean>;
  disconnect(): Promise<void>;
  testConnection(): Promise<boolean>;

  // Продажи
  getSales(params: SalesParams): Promise<SalesData[]>;
  getSalesByDateRange(startDate: Date, endDate: Date): Promise<SalesData[]>;

  // Товары
  getProducts(params?: ProductsParams): Promise<ProductData[]>;
  getProductById(productId: string): Promise<ProductData>;
  getStock(params?: StockParams): Promise<StockData[]>;

  // Заказы
  getOrders(params?: OrdersParams): Promise<OrderData[]>;
  getOrderById(orderId: string): Promise<OrderData>;

  // Реклама
  getAdCampaigns(params?: AdCampaignsParams): Promise<AdCampaignData[]>;
  getAdStatistics(campaignId: string, params?: AdStatisticsParams): Promise<AdStatisticsData>;

  // Региональные данные
  getRegionalData(params?: RegionalDataParams): Promise<RegionalData[]>;
}

export interface MarketplaceCredentials {
  apiKey?: string;
  apiSecret?: string;
  token?: string;
  [key: string]: any;
}

export interface SalesParams {
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
  productId?: string;
}

export interface SalesData {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  price: number;
  totalAmount: number;
  date: Date;
  region?: string;
  orderId?: string;
  [key: string]: any;
}

export interface ProductsParams {
  limit?: number;
  offset?: number;
  categoryId?: string;
  search?: string;
}

export interface ProductData {
  id: string;
  name: string;
  sku: string;
  barcode?: string;
  category?: string;
  price: number;
  stock?: number;
  images?: string[];
  description?: string;
  [key: string]: any;
}

export interface StockParams {
  warehouseId?: string;
  productId?: string;
}

export interface StockData {
  productId: string;
  productName: string;
  warehouseId?: string;
  warehouseName?: string;
  quantity: number;
  reservedQuantity?: number;
  availableQuantity?: number;
  [key: string]: any;
}

export interface OrdersParams {
  startDate?: Date;
  endDate?: Date;
  status?: string;
  limit?: number;
  offset?: number;
}

export interface OrderData {
  id: string;
  orderNumber: string;
  date: Date;
  status: string;
  totalAmount: number;
  items: OrderItem[];
  customer?: CustomerData;
  region?: string;
  [key: string]: any;
}

export interface OrderItem {
  productId: string;
  productName: string;
  quantity: number;
  price: number;
  totalAmount: number;
}

export interface CustomerData {
  id?: string;
  name?: string;
  email?: string;
  phone?: string;
}

export interface AdCampaignsParams {
  status?: string;
  limit?: number;
  offset?: number;
}

export interface AdCampaignData {
  id: string;
  name: string;
  status: string;
  budget?: number;
  spent?: number;
  startDate?: Date;
  endDate?: Date;
  [key: string]: any;
}

export interface AdStatisticsParams {
  startDate?: Date;
  endDate?: Date;
  groupBy?: string;
}

export interface AdStatisticsData {
  campaignId: string;
  impressions: number;
  clicks: number;
  conversions: number;
  spent: number;
  revenue: number;
  roi?: number;
  [key: string]: any;
}

export interface RegionalDataParams {
  startDate?: Date;
  endDate?: Date;
  productId?: string;
}

export interface RegionalData {
  region: string;
  regionCode?: string;
  ordersCount: number;
  totalAmount: number;
  averageOrderValue: number;
  topProducts?: Array<{
    productId: string;
    productName: string;
    quantity: number;
  }>;
  [key: string]: any;
}

