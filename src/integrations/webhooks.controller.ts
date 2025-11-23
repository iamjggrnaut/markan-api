import { Controller, Post, Body, Param, Headers, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { IntegrationsService } from './integrations.service';
import { WebhookValidationService } from './webhook-validation.service';
import { WebhookEventType, WebhookEventStatus } from './webhook-event.entity';
import { MarketplaceType } from './marketplace-account.entity';

@ApiTags('Webhooks')
@Controller('webhooks')
export class WebhooksController {
  constructor(
    private readonly integrationsService: IntegrationsService,
    private readonly webhookValidationService: WebhookValidationService,
  ) {}

  @Post(':marketplaceType')
  @ApiOperation({ summary: 'Получить webhook от маркетплейса' })
  async handleWebhook(
    @Param('marketplaceType') marketplaceType: string,
    @Body() payload: any,
    @Headers() headers: any,
  ) {
    // Преобразуем marketplaceType в enum
    const marketplaceTypeEnum = this.parseMarketplaceType(marketplaceType);
    if (!marketplaceTypeEnum) {
      throw new BadRequestException(`Unsupported marketplace type: ${marketplaceType}`);
    }

    // Ищем аккаунт по данным webhook
    const account = await this.webhookValidationService.findAccountByWebhookData(
      marketplaceTypeEnum,
      payload,
      headers,
    );

    if (!account) {
      // Если не нашли аккаунт, все равно создаем событие, но помечаем как невалидное
      return {
        message: 'Webhook received but account not found',
        eventType: WebhookEventType.CUSTOM,
        status: 'account_not_found',
      };
    }

    // Валидируем подпись webhook
    try {
      const isValid = await this.webhookValidationService.validateWebhook(
        marketplaceTypeEnum,
        payload,
        headers,
        account,
      );

      if (!isValid) {
        throw new UnauthorizedException('Invalid webhook signature');
      }
    } catch (error) {
      // Логируем ошибку валидации
      // В production здесь можно добавить логирование в отдельную систему
      throw new UnauthorizedException(`Webhook validation failed: ${error.message}`);
    }

    // Определяем тип события
    const eventType = this.webhookValidationService.determineEventType(
      marketplaceTypeEnum,
      payload,
    );

    // Создаем событие в БД
    const event = await this.integrationsService.createWebhookEvent(
      account.id,
      eventType,
      payload,
    );

    // Обрабатываем событие асинхронно (можно добавить в очередь)
    // Пока просто возвращаем успех
    return {
      message: 'Webhook received and processed',
      eventId: event.id,
      eventType,
      accountId: account.id,
    };
  }

  private parseMarketplaceType(type: string): MarketplaceType | null {
    const typeMap: Record<string, MarketplaceType> = {
      'wildberries': MarketplaceType.WILDBERRIES,
      'ozon': MarketplaceType.OZON,
      'yandex_market': MarketplaceType.YANDEX_MARKET,
      'yandex-market': MarketplaceType.YANDEX_MARKET,
    };
    return typeMap[type.toLowerCase()] || null;
  }
}

