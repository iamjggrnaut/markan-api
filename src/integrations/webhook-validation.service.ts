import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { MarketplaceAccount, MarketplaceType } from './marketplace-account.entity';
import { WebhookEventType } from './webhook-event.entity';
import { EncryptionService } from './encryption.service';

@Injectable()
export class WebhookValidationService {
  constructor(
    @InjectRepository(MarketplaceAccount)
    private accountsRepository: Repository<MarketplaceAccount>,
    private encryptionService: EncryptionService,
  ) {}

  /**
   * Валидация webhook для Wildberries
   */
  async validateWildberriesWebhook(
    payload: any,
    headers: any,
    account: MarketplaceAccount,
  ): Promise<boolean> {
    const credentials = this.getDecryptedCredentials(account);

    // Wildberries использует подпись в заголовке Authorization или X-Signature
    const signature = headers['x-signature'] || headers['authorization'] || headers['X-Signature'] || headers['Authorization'];

    if (!signature) {
      throw new UnauthorizedException('Webhook signature is missing');
    }

    // Получаем секретный ключ из credentials
    const secret = credentials.apiSecret || credentials.apiKey;

    if (!secret) {
      throw new BadRequestException('API secret is required for webhook validation');
    }

    // Создаем подпись из payload
    const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payloadString)
      .digest('hex');

    // Сравниваем подписи
    // Wildberries может отправлять подпись в разных форматах
    const receivedSignature = signature.replace('Bearer ', '').replace('WB ', '').trim();

    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature),
      Buffer.from(receivedSignature),
    );
  }

  /**
   * Валидация webhook для Ozon
   */
  async validateOzonWebhook(
    payload: any,
    headers: any,
    account: MarketplaceAccount,
  ): Promise<boolean> {
    const credentials = this.getDecryptedCredentials(account);

    // Ozon использует подпись в заголовке X-Ozon-Signature
    const signature = headers['x-ozon-signature'] || headers['X-Ozon-Signature'];

    if (!signature) {
      throw new UnauthorizedException('Webhook signature is missing');
    }

    // Получаем секретный ключ
    const secret = credentials.apiSecret;

    if (!secret) {
      throw new BadRequestException('API secret is required for webhook validation');
    }

    // Ozon использует HMAC-SHA256
    const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payloadString)
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature),
      Buffer.from(signature),
    );
  }

  /**
   * Валидация webhook для Yandex Market
   */
  async validateYandexMarketWebhook(
    payload: any,
    headers: any,
    account: MarketplaceAccount,
  ): Promise<boolean> {
    const credentials = this.getDecryptedCredentials(account);

    // Yandex Market использует подпись в заголовке X-Yandex-Market-Signature
    const signature = headers['x-yandex-market-signature'] || headers['X-Yandex-Market-Signature'];

    if (!signature) {
      throw new UnauthorizedException('Webhook signature is missing');
    }

    // Получаем OAuth secret или используем токен
    const secret = credentials.apiSecret || credentials.token;

    if (!secret) {
      throw new BadRequestException('OAuth secret is required for webhook validation');
    }

    // Yandex Market использует HMAC-SHA256
    const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payloadString)
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature),
      Buffer.from(signature),
    );
  }

  /**
   * Определение типа события из payload для Wildberries
   */
  determineWildberriesEventType(payload: any): WebhookEventType {
    // Wildberries структура payload
    if (payload.eventType) {
      const eventTypeMap: Record<string, WebhookEventType> = {
        'order_created': WebhookEventType.ORDER_CREATED,
        'order_updated': WebhookEventType.ORDER_UPDATED,
        'order_cancelled': WebhookEventType.ORDER_CANCELLED,
        'product_updated': WebhookEventType.PRODUCT_UPDATED,
        'stock_updated': WebhookEventType.STOCK_UPDATED,
        'price_updated': WebhookEventType.PRICE_UPDATED,
        'review_received': WebhookEventType.REVIEW_RECEIVED,
      };
      return eventTypeMap[payload.eventType] || WebhookEventType.CUSTOM;
    }

    // Альтернативная структура
    if (payload.type) {
      return this.mapEventType(payload.type);
    }

    return WebhookEventType.CUSTOM;
  }

  /**
   * Определение типа события из payload для Ozon
   */
  determineOzonEventType(payload: any): WebhookEventType {
    // Ozon структура payload
    if (payload.type) {
      const eventTypeMap: Record<string, WebhookEventType> = {
        'POSTING_FBS_CREATED': WebhookEventType.ORDER_CREATED,
        'POSTING_FBS_CHANGED': WebhookEventType.ORDER_UPDATED,
        'POSTING_FBS_CANCELLED': WebhookEventType.ORDER_CANCELLED,
        'PRODUCT_PRICE_CHANGED': WebhookEventType.PRICE_UPDATED,
        'PRODUCT_STOCK_CHANGED': WebhookEventType.STOCK_UPDATED,
        'PRODUCT_INFO_CHANGED': WebhookEventType.PRODUCT_UPDATED,
      };
      return eventTypeMap[payload.type] || WebhookEventType.CUSTOM;
    }

    return WebhookEventType.CUSTOM;
  }

  /**
   * Определение типа события из payload для Yandex Market
   */
  determineYandexMarketEventType(payload: any): WebhookEventType {
    // Yandex Market структура payload
    if (payload.event) {
      const eventTypeMap: Record<string, WebhookEventType> = {
        'ORDER_CREATED': WebhookEventType.ORDER_CREATED,
        'ORDER_STATUS_CHANGED': WebhookEventType.ORDER_UPDATED,
        'ORDER_CANCELLED': WebhookEventType.ORDER_CANCELLED,
        'STOCK_UPDATED': WebhookEventType.STOCK_UPDATED,
        'PRICE_UPDATED': WebhookEventType.PRICE_UPDATED,
        'PRODUCT_UPDATED': WebhookEventType.PRODUCT_UPDATED,
      };
      return eventTypeMap[payload.event] || WebhookEventType.CUSTOM;
    }

    return WebhookEventType.CUSTOM;
  }

  /**
   * Поиск аккаунта по данным webhook
   */
  async findAccountByWebhookData(
    marketplaceType: MarketplaceType,
    payload: any,
    headers: any,
  ): Promise<MarketplaceAccount | null> {
    // Пытаемся найти accountId в payload или headers
    let accountId: string | null = null;
    let apiKey: string | null = null;

    // Вариант 1: accountId в payload
    if (payload.accountId || payload.account_id) {
      accountId = payload.accountId || payload.account_id;
    }

    // Вариант 2: accountId в headers
    if (!accountId && (headers['x-account-id'] || headers['X-Account-Id'])) {
      accountId = headers['x-account-id'] || headers['X-Account-Id'];
    }

    // Вариант 3: apiKey в payload или headers (для поиска по API ключу)
    if (payload.apiKey || payload.api_key) {
      apiKey = payload.apiKey || payload.api_key;
    }
    if (!apiKey && (headers['x-api-key'] || headers['X-Api-Key'])) {
      apiKey = headers['x-api-key'] || headers['X-Api-Key'];
    }

    // Ищем аккаунт
    if (accountId) {
      const account = await this.accountsRepository.findOne({
        where: { id: accountId, marketplaceType },
      });
      if (account) {
        return account;
      }
    }

    // Если не нашли по accountId, пытаемся найти по API ключу
    if (apiKey) {
      const accounts = await this.accountsRepository.find({
        where: { marketplaceType },
      });

      for (const account of accounts) {
        const credentials = this.getDecryptedCredentials(account);
        if (credentials.apiKey === apiKey) {
          return account;
        }
      }
    }

    // Если не нашли, возвращаем null
    // В этом случае нужно будет создать событие без привязки к аккаунту
    return null;
  }

  /**
   * Валидация webhook для любого маркетплейса
   */
  async validateWebhook(
    marketplaceType: MarketplaceType,
    payload: any,
    headers: any,
    account: MarketplaceAccount,
  ): Promise<boolean> {
    switch (marketplaceType) {
      case MarketplaceType.WILDBERRIES:
        return this.validateWildberriesWebhook(payload, headers, account);
      case MarketplaceType.OZON:
        return this.validateOzonWebhook(payload, headers, account);
      case MarketplaceType.YANDEX_MARKET:
        return this.validateYandexMarketWebhook(payload, headers, account);
      default:
        throw new BadRequestException(`Unsupported marketplace type: ${marketplaceType}`);
    }
  }

  /**
   * Определение типа события для любого маркетплейса
   */
  determineEventType(
    marketplaceType: MarketplaceType,
    payload: any,
  ): WebhookEventType {
    switch (marketplaceType) {
      case MarketplaceType.WILDBERRIES:
        return this.determineWildberriesEventType(payload);
      case MarketplaceType.OZON:
        return this.determineOzonEventType(payload);
      case MarketplaceType.YANDEX_MARKET:
        return this.determineYandexMarketEventType(payload);
      default:
        return WebhookEventType.CUSTOM;
    }
  }

  /**
   * Маппинг строкового типа события в enum
   */
  private mapEventType(type: string): WebhookEventType {
    const typeMap: Record<string, WebhookEventType> = {
      'order_created': WebhookEventType.ORDER_CREATED,
      'order_updated': WebhookEventType.ORDER_UPDATED,
      'order_cancelled': WebhookEventType.ORDER_CANCELLED,
      'product_updated': WebhookEventType.PRODUCT_UPDATED,
      'stock_updated': WebhookEventType.STOCK_UPDATED,
      'price_updated': WebhookEventType.PRICE_UPDATED,
      'review_received': WebhookEventType.REVIEW_RECEIVED,
    };
    return typeMap[type.toLowerCase()] || WebhookEventType.CUSTOM;
  }

  /**
   * Получение расшифрованных credentials
   */
  private getDecryptedCredentials(account: MarketplaceAccount): any {
    return {
      apiKey: account.encryptedApiKey
        ? this.encryptionService.decrypt(account.encryptedApiKey)
        : null,
      apiSecret: account.encryptedApiSecret
        ? this.encryptionService.decrypt(account.encryptedApiSecret)
        : null,
      token: account.encryptedToken
        ? this.encryptionService.decrypt(account.encryptedToken)
        : null,
    };
  }
}

