import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import * as redisStore from 'cache-manager-redis-store';
import { CustomersService } from './customers.service';
import { CustomersController } from './customers.controller';
import { CustomerSegment } from './customer-segment.entity';
import { CustomerSegmentMember } from './customer-segment-member.entity';
import { ProductSale } from '../products/product-sale.entity';
import { AIModule } from '../ai/ai.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CustomerSegment,
      CustomerSegmentMember,
      ProductSale,
    ]),
    CacheModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        store: redisStore,
        host: configService.get<string>('REDIS_HOST') || 'localhost',
        port: configService.get<number>('REDIS_PORT') || 6379,
        password: configService.get<string>('REDIS_PASSWORD') || undefined,
        ttl: 3600,
      }),
      inject: [ConfigService],
    }),
    AIModule,
  ],
  controllers: [CustomersController],
  providers: [CustomersService],
  exports: [CustomersService],
})
export class CustomersModule {}

