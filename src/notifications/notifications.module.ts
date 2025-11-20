import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import * as redisStore from 'cache-manager-redis-store';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { Notification } from './notification.entity';
import { NotificationPreference } from './notification-preference.entity';
import { TelegramChat } from './telegram-chat.entity';
import { TelegramService } from './telegram.service';
import { User } from '../users/user.entity';
import { ReportsModule } from '../reports/reports.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Notification, NotificationPreference, TelegramChat, User]),
    CacheModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        store: redisStore,
        host: configService.get<string>('REDIS_HOST') || 'localhost',
        port: configService.get<number>('REDIS_PORT') || 6379,
        password: configService.get<string>('REDIS_PASSWORD') || undefined,
        ttl: 300,
      }),
      inject: [ConfigService],
    }),
    ReportsModule,
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService, TelegramService],
  exports: [NotificationsService, TelegramService],
})
export class NotificationsModule {}

