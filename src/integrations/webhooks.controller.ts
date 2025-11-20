import { Controller, Post, Body, Param, Headers } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { IntegrationsService } from './integrations.service';
import { WebhookEventType } from './webhook-event.entity';

@ApiTags('Webhooks')
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly integrationsService: IntegrationsService) {}

  @Post(':marketplaceType')
  @ApiOperation({ summary: 'Получить webhook от маркетплейса' })
  async handleWebhook(
    @Param('marketplaceType') marketplaceType: string,
    @Body() payload: any,
    @Headers() headers: any,
  ) {
    // TODO: Валидация подписи webhook (зависит от маркетплейса)
    // TODO: Определение типа события из payload
    // TODO: Поиск аккаунта по marketplaceType и другим параметрам

    // Пока просто создаем событие
    const eventType = this.determineEventType(marketplaceType, payload);

    // TODO: Найти accountId из payload или headers
    // Для примера используем временный accountId
    // const accountId = await this.findAccountByWebhookData(marketplaceType, payload, headers);

    return {
      message: 'Webhook received',
      // accountId,
      eventType,
    };
  }

  private determineEventType(marketplaceType: string, payload: any): WebhookEventType {
    // TODO: Определить тип события на основе payload
    // Это зависит от конкретного маркетплейса
    return WebhookEventType.CUSTOM;
  }
}

