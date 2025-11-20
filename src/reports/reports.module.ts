import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import * as redisStore from 'cache-manager-redis-store';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { EmailService } from './email.service';
import { Report } from './report.entity';
import { ReportSchedule } from './report-schedule.entity';
import { AnalyticsModule } from '../analytics/analytics.module';
import { ProductsModule } from '../products/products.module';
import { GeoModule } from '../geo/geo.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Report, ReportSchedule]),
    CacheModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        store: redisStore,
        host: configService.get<string>('REDIS_HOST') || 'localhost',
        port: configService.get<number>('REDIS_PORT') || 6379,
        password: configService.get<string>('REDIS_PASSWORD') || undefined,
        ttl: 1800,
      }),
      inject: [ConfigService],
    }),
    AnalyticsModule,
    ProductsModule,
    GeoModule,
  ],
  controllers: [ReportsController],
  providers: [ReportsService, EmailService],
  exports: [ReportsService, EmailService],
})
export class ReportsModule {}

