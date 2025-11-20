import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WebhookEvent, WebhookEventStatus } from './webhook-event.entity';
import axios from 'axios';

interface WebhookRetryJob {
  webhookEventId: string;
  url: string;
  payload: any;
  headers?: any;
  attempt: number;
  maxAttempts: number;
}

@Processor('webhook-retry')
@Injectable()
export class WebhookRetryProcessor {
  constructor(
    @InjectRepository(WebhookEvent)
    private webhookEventsRepository: Repository<WebhookEvent>,
  ) {}

  @Process('retry-webhook')
  async handleRetry(job: Job<WebhookRetryJob>) {
    const { webhookEventId, url, payload, headers, attempt, maxAttempts } =
      job.data;

    try {
      const response = await axios.post(url, payload, {
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        timeout: 10000,
      });

      // Успешная доставка
      await this.webhookEventsRepository.update(webhookEventId, {
        status: WebhookEventStatus.DELIVERED,
        deliveredAt: new Date(),
        responseStatus: response.status,
        responseData: response.data,
      });

      return { success: true, attempt };
    } catch (error: any) {
      const isLastAttempt = attempt >= maxAttempts;

      if (isLastAttempt) {
        // Последняя попытка не удалась
        await this.webhookEventsRepository.update(webhookEventId, {
          status: WebhookEventStatus.FAILED,
          lastError: error.message,
          responseStatus: error.response?.status || null,
        });
        throw new Error(
          `Webhook delivery failed after ${maxAttempts} attempts: ${error.message}`,
        );
      }

      // Обновляем статус и планируем следующую попытку
      await this.webhookEventsRepository.update(webhookEventId, {
        status: WebhookEventStatus.PENDING,
        lastError: error.message,
        retryCount: attempt,
      });

      // Вычисляем задержку с экспоненциальным backoff
      const delay = Math.min(1000 * Math.pow(2, attempt), 60000); // Макс 60 секунд

      // Планируем следующую попытку
      throw new Error(`Retry scheduled in ${delay}ms`);
    }
  }
}

