import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import * as redisStore from 'cache-manager-redis-store';
import { AnalyticsService } from './analytics.service';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsGateway } from './analytics.gateway';
import { DashboardWidgetsService } from './dashboard-widgets.service';
import { DashboardWidget } from './dashboard-widget.entity';
import { ProductsModule } from '../products/products.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { ProductSale } from '../products/product-sale.entity';
import { Product } from '../products/product.entity';
import { MarketplaceAccount } from '../integrations/marketplace-account.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ProductSale,
      Product,
      MarketplaceAccount,
      DashboardWidget,
    ]),
    CacheModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        store: redisStore,
        host: configService.get<string>('REDIS_HOST') || 'localhost',
        port: configService.get<number>('REDIS_PORT') || 6379,
        password: configService.get<string>('REDIS_PASSWORD') || undefined,
        ttl: 300, // 5 минут по умолчанию
      }),
      inject: [ConfigService],
    }),
    JwtModule,
    ConfigModule,
    ProductsModule,
    IntegrationsModule,
  ],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, AnalyticsGateway, DashboardWidgetsService],
  exports: [AnalyticsService, AnalyticsGateway],
})
export class AnalyticsModule {}

