import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import * as redisStore from 'cache-manager-redis-store';
import { GeoService } from './geo.service';
import { GeoController } from './geo.controller';
import { RegionalData } from './regional-data.entity';
import { ProductSale } from '../products/product-sale.entity';
import { MarketplaceAccount } from '../integrations/marketplace-account.entity';
import { IntegrationsModule } from '../integrations/integrations.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([RegionalData, ProductSale, MarketplaceAccount]),
    CacheModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        store: redisStore,
        host: configService.get<string>('REDIS_HOST') || 'localhost',
        port: configService.get<number>('REDIS_PORT') || 6379,
        password: configService.get<string>('REDIS_PASSWORD') || undefined,
        ttl: 600, // 10 минут для региональных данных
      }),
      inject: [ConfigService],
    }),
    IntegrationsModule,
  ],
  controllers: [GeoController],
  providers: [GeoService],
  exports: [GeoService],
})
export class GeoModule {}

