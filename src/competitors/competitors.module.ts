import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import * as redisStore from 'cache-manager-redis-store';
import { CompetitorsService } from './competitors.service';
import { CompetitorsController } from './competitors.controller';
import { Competitor } from './competitor.entity';
import { CompetitorProduct } from './competitor-product.entity';
import { CompetitorPromotion } from './competitor-promotion.entity';
import { Product } from '../products/product.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Competitor,
      CompetitorProduct,
      CompetitorPromotion,
      Product,
    ]),
    CacheModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        store: redisStore,
        host: configService.get<string>('REDIS_HOST') || 'localhost',
        port: configService.get<number>('REDIS_PORT') || 6379,
        password: configService.get<string>('REDIS_PASSWORD') || undefined,
        ttl: 1800, // 30 минут
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [CompetitorsController],
  providers: [CompetitorsService],
  exports: [CompetitorsService],
})
export class CompetitorsModule {}

