import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as QRCode from 'qrcode';
import {
  IPaymentProvider,
  CreatePaymentData,
  PaymentProviderResult,
  VerifyPaymentData,
  PaymentVerificationResult,
} from './payment-provider.interface';

@Injectable()
export class SBPProvider implements IPaymentProvider {
  constructor(private configService: ConfigService) {}

  getName(): string {
    return 'sbp';
  }

  async createPayment(data: CreatePaymentData): Promise<PaymentProviderResult> {
    // Генерируем уникальный комментарий для перевода
    const paymentComment = `NEBULA-${Date.now()}-${data.userId.substring(0, 8).toUpperCase()}`;

    // Генерируем QR-код для СБП
    const qrData = this.generateSBPQRCode(data.amount, paymentComment);
    const qrCode = await QRCode.toDataURL(qrData);

    return {
      paymentComment,
      qrCode,
      metadata: {
        recipientName: this.configService.get('SBP_RECIPIENT_NAME') || 'Nebula Markan',
        phoneNumber: this.configService.get('SBP_PHONE_NUMBER') || '',
      },
    };
  }

  async verifyPayment(data: VerifyPaymentData): Promise<PaymentVerificationResult> {
    // Для СБП проверка происходит вручную администратором
    // Этот метод используется только для структуры интерфейса
    return {
      isVerified: false,
      status: 'pending',
    };
  }

  /**
   * Генерация данных для QR-кода СБП
   */
  private generateSBPQRCode(amount: number, comment: string): string {
    const recipientName = this.configService.get('SBP_RECIPIENT_NAME') || 'Nebula Markan';
    const phoneNumber = this.configService.get('SBP_PHONE_NUMBER') || '';

    // Формат QR-кода для СБП: ST00012|Name=Имя получателя|PersonalAcc=Номер счета|Sum=Сумма|Purpose=Комментарий
    if (phoneNumber) {
      return `ST00012|Name=${recipientName}|PersonalAcc=${phoneNumber}|Sum=${amount}|Purpose=${comment}`;
    }

    // Иначе возвращаем простой формат с комментарием
    return `ST00012|Name=${recipientName}|Sum=${amount}|Purpose=${comment}`;
  }
}
