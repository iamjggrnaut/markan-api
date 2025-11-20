import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

@Injectable()
export class AIClientService {
  private client: AxiosInstance;
  private aiServiceUrl: string;

  constructor(private configService: ConfigService) {
    this.aiServiceUrl =
      this.configService.get<string>('AI_SERVICE_URL') ||
      'http://localhost:8000';

    this.client = axios.create({
      baseURL: this.aiServiceUrl,
      timeout: 30000, // 30 секунд для AI операций
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  async forecastDemand(
    salesData: Array<{ date: string; quantity: number }>,
    days: number = 30,
  ): Promise<any> {
    try {
      const response = await this.client.post('/forecast/demand', {
        sales_data: salesData,
        days,
      });
      return response.data;
    } catch (error: any) {
      console.error('AI Service error (forecast):', error.message);
      // Fallback на простой алгоритм
      throw error;
    }
  }

  async recommendPrice(
    productData: any,
    salesHistory: Array<{ price: number; quantity: number }>,
    competitorPrices?: number[],
  ): Promise<any> {
    try {
      const response = await this.client.post('/recommendations/price', {
        product_data: productData,
        sales_history: salesHistory,
        competitor_prices: competitorPrices,
      });
      return response.data;
    } catch (error: any) {
      console.error('AI Service error (price):', error.message);
      throw error;
    }
  }

  async detectAnomalies(
    salesData: Array<{ date: string; quantity: number; revenue?: number }>,
    threshold: number = 2.0,
  ): Promise<any> {
    try {
      const response = await this.client.post('/detect/anomalies', {
        sales_data: salesData,
        threshold,
      });
      return response.data;
    } catch (error: any) {
      console.error('AI Service error (anomalies):', error.message);
      throw error;
    }
  }

  async segmentCustomers(
    customerData: Array<Record<string, any>>,
    nClusters: number = 5,
  ): Promise<any> {
    try {
      const response = await this.client.post('/segmentation/customers', {
        customer_data: customerData,
        n_clusters: nClusters,
      });
      return response.data;
    } catch (error: any) {
      console.error('AI Service error (segmentation):', error.message);
      throw error;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.client.get('/health');
      return response.data.status === 'healthy';
    } catch (error) {
      return false;
    }
  }
}

