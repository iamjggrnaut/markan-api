import { PlanType } from '../../plans/plan.entity';

export interface CreatePaymentData {
  userId: string;
  planType: PlanType;
  billingPeriod: string;
  amount: number;
  currency: string;
}

export interface PaymentProviderResult {
  externalPaymentId?: string; // ID платежа в системе провайдера
  paymentUrl?: string; // URL для оплаты (для ЮКассы)
  qrCode?: string; // QR-код (для СБП)
  paymentComment?: string; // Комментарий для перевода (для СБП)
  metadata?: any; // Дополнительные данные
}

export interface VerifyPaymentData {
  paymentId: string;
  externalPaymentId?: string;
  webhookData?: any;
}

export interface PaymentVerificationResult {
  isVerified: boolean;
  status: 'succeeded' | 'canceled' | 'pending' | 'failed';
  metadata?: any;
}

/**
 * Интерфейс для платежных провайдеров
 */
export interface IPaymentProvider {
  /**
   * Создать платеж
   */
  createPayment(data: CreatePaymentData): Promise<PaymentProviderResult>;

  /**
   * Проверить статус платежа
   */
  verifyPayment(data: VerifyPaymentData): Promise<PaymentVerificationResult>;

  /**
   * Обработать webhook от провайдера
   */
  processWebhook?(webhookData: any): Promise<PaymentVerificationResult>;

  /**
   * Получить название провайдера
   */
  getName(): string;
}
