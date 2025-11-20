import { Injectable, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { Notification, NotificationType, NotificationChannel, NotificationStatus } from './notification.entity';
import { NotificationPreference } from './notification-preference.entity';
import { TelegramChat } from './telegram-chat.entity';
import { EmailService } from '../reports/email.service';
import { TelegramService } from './telegram.service';
import { User } from '../users/user.entity';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private notificationsRepository: Repository<Notification>,
    @InjectRepository(NotificationPreference)
    private preferencesRepository: Repository<NotificationPreference>,
    @InjectRepository(TelegramChat)
    private telegramChatsRepository: Repository<TelegramChat>,
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private emailService: EmailService,
    private telegramService: TelegramService,
  ) {}

  async create(
    userId: string,
    organizationId: string | null,
    type: NotificationType,
    title: string,
    message: string,
    channel: NotificationChannel,
    data?: any,
  ): Promise<Notification> {
    // Проверяем настройки пользователя
    const isEnabled = await this.isNotificationEnabled(userId, type, channel);
    if (!isEnabled) {
      return null; // Уведомление отключено пользователем
    }

    const notification = this.notificationsRepository.create({
      user: { id: userId } as any,
      organization: organizationId ? ({ id: organizationId } as any) : null,
      type,
      channel,
      title,
      message,
      data,
      status: NotificationStatus.PENDING,
    });

    const saved = await this.notificationsRepository.save(notification);

    // Отправляем уведомление
    await this.sendNotification(saved);

    return saved;
  }

  async sendNotification(notification: Notification): Promise<void> {
    try {
      const user = await this.usersRepository.findOne({
        where: { id: notification.user.id },
      });

      if (!user) {
        return;
      }

      switch (notification.channel) {
        case NotificationChannel.EMAIL:
          await this.sendEmailNotification(notification, user.email);
          break;

        case NotificationChannel.PUSH:
          await this.sendPushNotification(notification);
          break;

        case NotificationChannel.TELEGRAM:
          await this.sendTelegramNotification(notification);
          break;

        case NotificationChannel.IN_APP:
          // In-app уведомления сохраняются в БД
          notification.status = NotificationStatus.SENT;
          notification.sentAt = new Date();
          await this.notificationsRepository.save(notification);
          break;
      }
    } catch (error) {
      notification.status = NotificationStatus.FAILED;
      notification.metadata = { error: error.message };
      await this.notificationsRepository.save(notification);
    }
  }

  private async sendEmailNotification(
    notification: Notification,
    email: string,
  ): Promise<void> {
    await this.emailService.sendNotification(
      email,
      notification.title,
      notification.message,
    );

    notification.status = NotificationStatus.SENT;
    notification.sentAt = new Date();
    await this.notificationsRepository.save(notification);
  }

  private async sendPushNotification(
    notification: Notification,
  ): Promise<void> {
    // TODO: Реализовать отправку push-уведомлений через WebPush API
    // Пока просто помечаем как отправленное
    notification.status = NotificationStatus.SENT;
    notification.sentAt = new Date();
    await this.notificationsRepository.save(notification);
  }

  private async sendTelegramNotification(
    notification: Notification,
  ): Promise<void> {
    const telegramChat = await this.telegramChatsRepository.findOne({
      where: { user: { id: notification.user.id }, isActive: true },
    });

    if (!telegramChat) {
      // Пользователь не подключил Telegram
      notification.status = NotificationStatus.FAILED;
      notification.metadata = { error: 'Telegram chat not found' };
      await this.notificationsRepository.save(notification);
      return;
    }

    try {
      await this.telegramService.sendMessage(
        telegramChat.chatId,
        `🔔 ${notification.title}\n\n${notification.message}`,
      );

      notification.status = NotificationStatus.SENT;
      notification.sentAt = new Date();
      await this.notificationsRepository.save(notification);
    } catch (error: any) {
      notification.status = NotificationStatus.FAILED;
      notification.metadata = { error: error.message };
      await this.notificationsRepository.save(notification);
    }
  }

  async registerTelegramChat(
    userId: string,
    chatId: number,
    username?: string,
    firstName?: string,
    lastName?: string,
  ): Promise<TelegramChat> {
    let chat = await this.telegramChatsRepository.findOne({
      where: { chatId },
    });

    if (chat) {
      chat.user = { id: userId } as any;
      chat.username = username;
      chat.firstName = firstName;
      chat.lastName = lastName;
      chat.isActive = true;
    } else {
      chat = this.telegramChatsRepository.create({
        user: { id: userId } as any,
        chatId,
        username,
        firstName,
        lastName,
        isActive: true,
      });
    }

    return this.telegramChatsRepository.save(chat);
  }

  async unregisterTelegramChat(chatId: number): Promise<void> {
    const chat = await this.telegramChatsRepository.findOne({
      where: { chatId },
    });

    if (chat) {
      chat.isActive = false;
      await this.telegramChatsRepository.save(chat);
    }
  }

  async getNotifications(
    userId: string,
    organizationId: string | null,
    isRead?: boolean,
    limit: number = 50,
  ): Promise<Notification[]> {
    const where: any = { user: { id: userId } };
    if (organizationId) {
      where.organization = { id: organizationId };
    }
    if (isRead !== undefined) {
      where.isRead = isRead;
    }

    return this.notificationsRepository.find({
      where,
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  async markAsRead(id: string, userId: string): Promise<Notification> {
    const notification = await this.notificationsRepository.findOne({
      where: { id, user: { id: userId } },
    });

    if (!notification) {
      throw new Error(`Notification with ID ${id} not found`);
    }

    notification.isRead = true;
    notification.readAt = new Date();
    return this.notificationsRepository.save(notification);
  }

  async markAllAsRead(
    userId: string,
    organizationId: string | null,
  ): Promise<void> {
    const where: any = { user: { id: userId }, isRead: false };
    if (organizationId) {
      where.organization = { id: organizationId };
    }

    await this.notificationsRepository.update(where, {
      isRead: true,
      readAt: new Date(),
    });
  }

  async getUnreadCount(
    userId: string,
    organizationId: string | null,
  ): Promise<number> {
    const where: any = { user: { id: userId }, isRead: false };
    if (organizationId) {
      where.organization = { id: organizationId };
    }

    return this.notificationsRepository.count({ where });
  }

  async setPreference(
    userId: string,
    type: NotificationType,
    channel: NotificationChannel,
    enabled: boolean,
  ): Promise<NotificationPreference> {
    let preference = await this.preferencesRepository.findOne({
      where: { user: { id: userId }, type, channel },
    });

    if (preference) {
      preference.enabled = enabled;
    } else {
      preference = this.preferencesRepository.create({
        user: { id: userId } as any,
        type,
        channel,
        enabled,
      });
    }

    return this.preferencesRepository.save(preference);
  }

  async getPreferences(
    userId: string,
  ): Promise<NotificationPreference[]> {
    return this.preferencesRepository.find({
      where: { user: { id: userId } },
    });
  }

  private async isNotificationEnabled(
    userId: string,
    type: NotificationType,
    channel: NotificationChannel,
  ): Promise<boolean> {
    const preference = await this.preferencesRepository.findOne({
      where: { user: { id: userId }, type, channel },
    });

    // По умолчанию все уведомления включены
    return preference ? preference.enabled : true;
  }

  // Методы для создания специфичных уведомлений
  async notifyLowStock(
    userId: string,
    organizationId: string | null,
    productName: string,
    currentStock: number,
    channels: NotificationChannel[] = [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
  ): Promise<void> {
    for (const channel of channels) {
      await this.create(
        userId,
        organizationId,
        NotificationType.LOW_STOCK,
        'Критический остаток товара',
        `Товар "${productName}" имеет критически низкий остаток: ${currentStock} шт.`,
        channel,
        { productName, currentStock },
      );
    }
  }

  async notifySalesDrop(
    userId: string,
    organizationId: string | null,
    dropPercent: number,
    channels: NotificationChannel[] = [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
  ): Promise<void> {
    for (const channel of channels) {
      await this.create(
        userId,
        organizationId,
        NotificationType.SALES_DROP,
        'Падение продаж',
        `Обнаружено падение продаж на ${dropPercent.toFixed(1)}% по сравнению с предыдущим периодом`,
        channel,
        { dropPercent },
      );
    }
  }

  async notifyAnomaly(
    userId: string,
    organizationId: string | null,
    anomalyType: string,
    description: string,
    channels: NotificationChannel[] = [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
  ): Promise<void> {
    for (const channel of channels) {
      await this.create(
        userId,
        organizationId,
        NotificationType.ANOMALY_DETECTED,
        'Обнаружена аномалия',
        description,
        channel,
        { anomalyType },
      );
    }
  }

  async notifyCompetitorPriceChange(
    userId: string,
    organizationId: string | null,
    competitorName: string,
    productName: string,
    oldPrice: number,
    newPrice: number,
    channels: NotificationChannel[] = [NotificationChannel.IN_APP],
  ): Promise<void> {
    for (const channel of channels) {
      await this.create(
        userId,
        organizationId,
        NotificationType.COMPETITOR_PRICE_CHANGE,
        'Изменение цены у конкурента',
        `Конкурент "${competitorName}" изменил цену на "${productName}": ${oldPrice} ₽ → ${newPrice} ₽`,
        channel,
        { competitorName, productName, oldPrice, newPrice },
      );
    }
  }

  async notifySyncCompleted(
    userId: string,
    organizationId: string | null,
    accountName: string,
    recordsProcessed: number,
    channels: NotificationChannel[] = [NotificationChannel.IN_APP],
  ): Promise<void> {
    for (const channel of channels) {
      await this.create(
        userId,
        organizationId,
        NotificationType.SYNC_COMPLETED,
        'Синхронизация завершена',
        `Синхронизация аккаунта "${accountName}" успешно завершена. Обработано записей: ${recordsProcessed}`,
        channel,
        { accountName, recordsProcessed },
      );
    }
  }

  async notifySyncFailed(
    userId: string,
    organizationId: string | null,
    accountName: string,
    error: string,
    channels: NotificationChannel[] = [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
  ): Promise<void> {
    for (const channel of channels) {
      await this.create(
        userId,
        organizationId,
        NotificationType.SYNC_FAILED,
        'Ошибка синхронизации',
        `Синхронизация аккаунта "${accountName}" завершилась с ошибкой: ${error}`,
        channel,
        { accountName, error },
      );
    }
  }

  async notifyPriceChange(
    userId: string,
    organizationId: string | null,
    productName: string,
    oldPrice: number,
    newPrice: number,
    channels: NotificationChannel[] = [NotificationChannel.IN_APP],
  ): Promise<void> {
    for (const channel of channels) {
      await this.create(
        userId,
        organizationId,
        NotificationType.PRICE_CHANGE,
        'Изменение цены',
        `Цена на товар "${productName}" изменена: ${oldPrice} ₽ → ${newPrice} ₽`,
        channel,
        { productName, oldPrice, newPrice },
      );
    }
  }

  async notifyNewOrder(
    userId: string,
    organizationId: string | null,
    orderId: string,
    orderAmount: number,
    channels: NotificationChannel[] = [NotificationChannel.IN_APP],
  ): Promise<void> {
    for (const channel of channels) {
      await this.create(
        userId,
        organizationId,
        NotificationType.NEW_ORDER,
        'Новый заказ',
        `Получен новый заказ #${orderId} на сумму ${orderAmount.toFixed(2)} ₽`,
        channel,
        { orderId, orderAmount },
      );
    }
  }

  async notifyReportReady(
    userId: string,
    organizationId: string | null,
    reportTitle: string,
    reportId: string,
    channels: NotificationChannel[] = [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
  ): Promise<void> {
    for (const channel of channels) {
      await this.create(
        userId,
        organizationId,
        NotificationType.REPORT_READY,
        'Отчет готов',
        `Отчет "${reportTitle}" успешно сгенерирован и готов к скачиванию`,
        channel,
        { reportTitle, reportId },
      );
    }
  }

  async notifyCriticalEvent(
    userId: string,
    organizationId: string | null,
    eventTitle: string,
    eventDescription: string,
    channels: NotificationChannel[] = [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
  ): Promise<void> {
    for (const channel of channels) {
      await this.create(
        userId,
        organizationId,
        NotificationType.ANOMALY_DETECTED,
        `Критическое событие: ${eventTitle}`,
        eventDescription,
        channel,
        { eventTitle },
      );
    }
  }
}

