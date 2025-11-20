import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IPaymentProvider } from './payment-provider.interface';
import { SBPProvider } from './sbp.provider';
import { YooKassaProvider } from './yookassa.provider';

@Injectable()
export class PaymentProviderFactory {
  constructor(
    private configService: ConfigService,
    private sbpProvider: SBPProvider,
    private yooKassaProvider: YooKassaProvider,
  ) {}

  /**
   * Получить активный провайдер платежей
   */
  getProvider(): IPaymentProvider {
    const providerName = this.configService.get('PAYMENT_PROVIDER') || 'sbp';

    switch (providerName.toLowerCase()) {
      case 'sbp':
        return this.sbpProvider;
      case 'yookassa':
        return this.yooKassaProvider;
      default:
        return this.sbpProvider; // По умолчанию СБП
    }
  }

  /**
   * Получить провайдер по имени
   */
  getProviderByName(name: string): IPaymentProvider {
    switch (name.toLowerCase()) {
      case 'sbp':
        return this.sbpProvider;
      case 'yookassa':
        return this.yooKassaProvider;
      default:
        throw new Error(`Unknown payment provider: ${name}`);
    }
  }

  /**
   * Получить список доступных провайдеров
   */
  getAvailableProviders(): string[] {
    return ['sbp', 'yookassa'];
  }
}

