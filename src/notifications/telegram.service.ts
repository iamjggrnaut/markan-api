import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class TelegramService {
  private botToken: string;
  private apiUrl: string;

  constructor(private configService: ConfigService) {
    this.botToken = this.configService.get<string>('TELEGRAM_BOT_TOKEN') || '';
    this.apiUrl = `https://api.telegram.org/bot${this.botToken}`;
  }

  async sendMessage(chatId: number, text: string): Promise<void> {
    if (!this.botToken) {
      console.warn('Telegram bot token not configured');
      return;
    }

    try {
      await axios.post(`${this.apiUrl}/sendMessage`, {
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
      });
    } catch (error: any) {
      console.error('Failed to send Telegram message:', error.response?.data || error.message);
      throw error;
    }
  }

  async sendNotification(
    chatId: number,
    title: string,
    message: string,
  ): Promise<void> {
    const fullMessage = `🔔 <b>${title}</b>\n\n${message}`;
    await this.sendMessage(chatId, fullMessage);
  }

  async sendLowStockNotification(
    chatId: number,
    productName: string,
    currentStock: number,
  ): Promise<void> {
    await this.sendNotification(
      chatId,
      '⚠️ Критический остаток товара',
      `Товар "<b>${productName}</b>" имеет критически низкий остаток: <b>${currentStock} шт.</b>`,
    );
  }

  async sendSalesDropNotification(
    chatId: number,
    dropPercent: number,
  ): Promise<void> {
    await this.sendNotification(
      chatId,
      '📉 Падение продаж',
      `Обнаружено падение продаж на <b>${dropPercent.toFixed(1)}%</b> по сравнению с предыдущим периодом`,
    );
  }

  async sendAnomalyNotification(
    chatId: number,
    description: string,
  ): Promise<void> {
    await this.sendNotification(
      chatId,
      '⚠️ Обнаружена аномалия',
      description,
    );
  }

  async sendSyncCompletedNotification(
    chatId: number,
    accountName: string,
    recordsProcessed: number,
  ): Promise<void> {
    await this.sendNotification(
      chatId,
      '✅ Синхронизация завершена',
      `Синхронизация аккаунта "<b>${accountName}</b>" успешно завершена.\nОбработано записей: <b>${recordsProcessed}</b>`,
    );
  }

  async sendSyncFailedNotification(
    chatId: number,
    accountName: string,
    error: string,
  ): Promise<void> {
    await this.sendNotification(
      chatId,
      '❌ Ошибка синхронизации',
      `Синхронизация аккаунта "<b>${accountName}</b>" завершилась с ошибкой:\n<code>${error}</code>`,
    );
  }
}

