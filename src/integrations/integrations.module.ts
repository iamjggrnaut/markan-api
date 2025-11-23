import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { IntegrationsService } from './integrations.service';
import { IntegrationsController } from './integrations.controller';
import { WebhooksController } from './webhooks.controller';
import { WebhookRetryProcessor } from './webhook-retry.processor';
import { MarketplaceAccount } from './marketplace-account.entity';
import { WebhookEvent } from './webhook-event.entity';
import { EncryptionService } from './encryption.service';
import { MarketplaceFactoryService } from './marketplaces/marketplace-factory.service';
import { WebhookValidationService } from './webhook-validation.service';
import { WildberriesService } from './marketplaces/wildberries/wildberries.service';
import { OzonService } from './marketplaces/ozon/ozon.service';
import { YandexMarketService } from './marketplaces/yandex-market/yandex-market.service';
import { UsersModule } from '../users/users.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { PlansModule } from '../plans/plans.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([MarketplaceAccount, WebhookEvent]),
    BullModule.registerQueue({
      name: 'webhook-retry',
    }),
    UsersModule,
    OrganizationsModule,
    PlansModule,
  ],
  controllers: [IntegrationsController, WebhooksController],
  providers: [
    IntegrationsService,
    EncryptionService,
    MarketplaceFactoryService,
    WildberriesService,
    OzonService,
    YandexMarketService,
    WebhookRetryProcessor,
    WebhookValidationService,
  ],
  exports: [IntegrationsService, EncryptionService],
})
export class IntegrationsModule {}

