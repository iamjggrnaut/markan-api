import { Injectable } from '@nestjs/common';
import { MarketplaceType } from '../marketplace-account.entity';
import { IMarketplaceIntegration } from '../interfaces/marketplace.interface';
import { WildberriesService } from './wildberries/wildberries.service';
import { OzonService } from './ozon/ozon.service';
import { YandexMarketService } from './yandex-market/yandex-market.service';

@Injectable()
export class MarketplaceFactoryService {
  constructor(
    private wildberriesService: WildberriesService,
    private ozonService: OzonService,
    private yandexMarketService: YandexMarketService,
  ) {}

  create(marketplaceType: MarketplaceType): IMarketplaceIntegration {
    switch (marketplaceType) {
      case MarketplaceType.WILDBERRIES:
        return this.wildberriesService;
      case MarketplaceType.OZON:
        return this.ozonService;
      case MarketplaceType.YANDEX_MARKET:
        return this.yandexMarketService;
      default:
        throw new Error(`Unsupported marketplace type: ${marketplaceType}`);
    }
  }
}

