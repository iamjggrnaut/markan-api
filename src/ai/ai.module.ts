import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import * as redisStore from 'cache-manager-redis-store';
import { AIService } from './ai.service';
import { AIController } from './ai.controller';
import { AIProcessor } from './ai.processor';
import { AIClientService } from './ai-client.service';
import { AITask } from './ai-task.entity';
import { AIRecommendation } from './ai-recommendation.entity';
import { ProductSale } from '../products/product-sale.entity';
import { ProductsModule } from '../products/products.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { BullModule } from '@nestjs/bull';

@Module({
  imports: [
    TypeOrmModule.forFeature([AITask, AIRecommendation, ProductSale]),
    CacheModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        store: redisStore,
        host: configService.get<string>('REDIS_HOST') || 'localhost',
        port: configService.get<number>('REDIS_PORT') || 6379,
        password: configService.get<string>('REDIS_PASSWORD') || undefined,
        ttl: 3600, // 1 час для AI результатов
      }),
      inject: [ConfigService],
    }),
    BullModule.registerQueue({
      name: 'ai',
      defaultJobOptions: {
        attempts: 2,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: 50,
        removeOnFail: 100,
      },
    }),
    ProductsModule,
    IntegrationsModule,
  ],
  controllers: [AIController],
  providers: [AIService, AIProcessor, AIClientService],
  exports: [AIService, AIClientService],
})
export class AIModule {}

