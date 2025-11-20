import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { PlansModule } from './plans/plans.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { SyncModule } from './sync/sync.module';
import { ProductsModule } from './products/products.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { GeoModule } from './geo/geo.module';
import { AIModule } from './ai/ai.module';
import { CompetitorsModule } from './competitors/competitors.module';
import { ReportsModule } from './reports/reports.module';
import { NotificationsModule } from './notifications/notifications.module';
import { CustomersModule } from './customers/customers.module';
import { ApiKeysModule } from './api-keys/api-keys.module';
import { SecurityModule } from './security/security.module';
import { AdminModule } from './admin/admin.module';
import { MailModule } from './mail/mail.module';
import { PaymentsModule } from './payments/payments.module';
import { BullModule } from '@nestjs/bull';
import { WinstonModule } from 'nest-winston';
import { getLoggerConfig } from './config/logger.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    WinstonModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => getLoggerConfig(configService),
      inject: [ConfigService],
    }),
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 1000, // 1 секунда
        limit: 3, // 3 запроса
      },
      {
        name: 'medium',
        ttl: 10000, // 10 секунд
        limit: 20, // 20 запросов
      },
      {
        name: 'long',
        ttl: 60000, // 1 минута
        limit: 100, // 100 запросов
      },
    ]),
    BullModule.forRoot({
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT) || 6379,
        password: process.env.REDIS_PASSWORD || undefined,
      },
    }),
    TypeOrmModule.forRootAsync({
      useFactory: () => ({
        type: 'postgres',
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT) || 5432,
        username: process.env.DB_USERNAME || 'postgres',
        password: process.env.DB_PASSWORD || 'postgres',
        database: process.env.DB_NAME || 'nebula_markan',
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        migrations: [__dirname + '/../migrations/**/*{.ts,.js}'],
        synchronize: process.env.NODE_ENV !== 'production', // ВАЖНО: false в production!
        logging: process.env.NODE_ENV === 'development',
        migrationsRun: process.env.NODE_ENV === 'production', // Автоматически запускать миграции в production
        migrationsTableName: 'migrations',
      }),
    }),
    AuthModule,
    UsersModule,
    PlansModule,
    OrganizationsModule,
    IntegrationsModule,
    SyncModule,
    ProductsModule,
    AnalyticsModule,
    GeoModule,
    AIModule,
    CompetitorsModule,
    ReportsModule,
    NotificationsModule,
    CustomersModule,
    ApiKeysModule,
    SecurityModule,
    AdminModule,
    MailModule,
    PaymentsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}

