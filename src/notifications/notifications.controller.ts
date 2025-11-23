import {
  Controller,
  Get,
  Post,
  Patch,
  UseGuards,
  Request,
  Query,
  Body,
  Param,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { NotificationType, NotificationChannel } from './notification.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Notifications')
@Controller('notifications')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Получить уведомления' })
  getNotifications(
    @Request() req,
    @Query('organizationId') organizationId?: string,
    @Query('isRead') isRead?: boolean,
    @Query('limit') limit?: number,
  ) {
    return this.notificationsService.getNotifications(
      req.user.userId,
      organizationId || null,
      isRead !== undefined ? isRead === true : undefined,
      limit ? parseInt(limit.toString()) : 50,
    );
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Получить количество непрочитанных уведомлений' })
  getUnreadCount(
    @Request() req,
    @Query('organizationId') organizationId?: string,
  ) {
    return this.notificationsService.getUnreadCount(
      req.user.userId,
      organizationId || null,
    );
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Пометить уведомление как прочитанное' })
  markAsRead(@Request() req, @Param('id') id: string) {
    return this.notificationsService.markAsRead(id, req.user.userId);
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Пометить все уведомления как прочитанные' })
  markAllAsRead(
    @Request() req,
    @Query('organizationId') organizationId?: string,
  ) {
    return this.notificationsService.markAllAsRead(
      req.user.userId,
      organizationId || null,
    );
  }

  @Get('preferences')
  @ApiOperation({ summary: 'Получить настройки уведомлений' })
  getPreferences(@Request() req) {
    return this.notificationsService.getPreferences(req.user.userId);
  }

  @Post('preferences')
  @ApiOperation({ summary: 'Настроить уведомления' })
  setPreference(
    @Request() req,
    @Body('type') type: NotificationType,
    @Body('channel') channel: NotificationChannel,
    @Body('enabled') enabled: boolean,
  ) {
    return this.notificationsService.setPreference(
      req.user.userId,
      type,
      channel,
      enabled,
    );
  }

  @Post('telegram/register')
  @ApiOperation({ summary: 'Зарегистрировать Telegram чат для уведомлений' })
  registerTelegramChat(
    @Request() req,
    @Body('chatId') chatId: number,
    @Body('username') username?: string,
    @Body('firstName') firstName?: string,
    @Body('lastName') lastName?: string,
  ) {
    return this.notificationsService.registerTelegramChat(
      req.user.userId,
      chatId,
      username,
      firstName,
      lastName,
    );
  }

  @Post('telegram/unregister')
  @ApiOperation({ summary: 'Отключить Telegram уведомления' })
  unregisterTelegramChat(@Body('chatId') chatId: number) {
    return this.notificationsService.unregisterTelegramChat(chatId);
  }

  @Post('push/subscribe')
  @ApiOperation({ summary: 'Подписаться на push-уведомления' })
  subscribePush(
    @Request() req,
    @Body() subscriptionData: any,
  ) {
    // TODO: Сохранить subscription в БД для отправки push-уведомлений
    // Пока просто возвращаем успех
    return { message: 'Push подписка зарегистрирована', success: true };
  }

  @Post('push/unsubscribe')
  @ApiOperation({ summary: 'Отписаться от push-уведомлений' })
  unsubscribePush(
    @Request() req,
    @Body() subscriptionData: any,
  ) {
    // TODO: Удалить subscription из БД
    return { message: 'Push подписка отменена', success: true };
  }
}

