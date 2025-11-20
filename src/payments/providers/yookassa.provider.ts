import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { YooKassa } from '@appigram/yookassa-node';
import {
  IPaymentProvider,
  CreatePaymentData,
  PaymentProviderResult,
  VerifyPaymentData,
  PaymentVerificationResult,
} from './payment-provider.interface';

@Injectable()
export class YooKassaProvider implements IPaymentProvider {
  private yooKassa: YooKassa;

  constructor(private configService: ConfigService) {
    const shopId = this.configService.get('YOOKASSA_SHOP_ID');
    const secretKey = this.configService.get('YOOKASSA_SECRET_KEY');

    if (!shopId || !secretKey) {
      throw new Error('YOOKASSA_SHOP_ID and YOOKASSA_SECRET_KEY must be set');
    }

    this.yooKassa = new YooKassa({
      shopId,
      secretKey,
    });
  }

  getName(): string {
    return 'yookassa';
  }

  async createPayment(data: CreatePaymentData): Promise<PaymentProviderResult> {
    try {
      const returnUrl = this.configService.get('YOOKASSA_RETURN_URL') || 
        `${this.configService.get('FRONTEND_URL') || 'http://localhost:3000'}/payment/success`;
      
      const description = `Подписка ${data.planType} на ${this.getPeriodLabel(data.billingPeriod)}`;

      const payment = await this.yooKassa.createPayment({
        amount: {
          value: data.amount.toFixed(2),
          currency: data.currency,
        },
        confirmation: {
          type: 'redirect',
          return_url: returnUrl,
        },
        capture: true,
        description: description,
        metadata: {
          userId: data.userId,
          planType: data.planType,
          billingPeriod: data.billingPeriod,
        },
      });

      return {
        externalPaymentId: payment.id,
        paymentUrl: payment.confirmation?.confirmation_url,
        metadata: {
          paymentId: payment.id,
          status: payment.status,
        },
      };
    } catch (error: any) {
      throw new BadRequestException(
        `Ошибка создания платежа в ЮКассе: ${error.message}`,
      );
    }
  }

  async verifyPayment(data: VerifyPaymentData): Promise<PaymentVerificationResult> {
    if (!data.externalPaymentId) {
      return {
        isVerified: false,
        status: 'pending',
      };
    }

    try {
      const payment = await this.yooKassa.getPayment(data.externalPaymentId);

      const statusMap: Record<string, 'succeeded' | 'canceled' | 'pending' | 'failed'> = {
        succeeded: 'succeeded',
        canceled: 'canceled',
        pending: 'pending',
        waiting_for_capture: 'pending',
      };

      return {
        isVerified: payment.status === 'succeeded',
        status: statusMap[payment.status] || 'pending',
        metadata: {
          paymentId: payment.id,
          status: payment.status,
          amount: payment.amount,
        },
      };
    } catch (error: any) {
      return {
        isVerified: false,
        status: 'failed',
        metadata: { error: error.message },
      };
    }
  }

  async processWebhook(webhookData: any): Promise<PaymentVerificationResult> {
    // Проверяем подпись webhook (важно для безопасности)
    // В реальной реализации нужно проверить X-YooMoney-Signature

    const event = webhookData.event;
    const payment = webhookData.object;

    if (event === 'payment.succeeded') {
      return {
        isVerified: true,
        status: 'succeeded',
        metadata: {
          paymentId: payment.id,
          amount: payment.amount,
        },
      };
    }

    if (event === 'payment.canceled') {
      return {
        isVerified: true,
        status: 'canceled',
        metadata: {
          paymentId: payment.id,
        },
      };
    }

    return {
      isVerified: false,
      status: 'pending',
      metadata: {
        event,
        paymentId: payment.id,
      },
    };
  }

  private getPeriodLabel(period: string): string {
    const labels: Record<string, string> = {
      monthly: '1 месяц',
      quarterly: '3 месяца',
      semiAnnual: '6 месяцев',
      annual: '12 месяцев',
    };
    return labels[period] || period;
  }
}

