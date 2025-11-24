import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SyncJob, SyncJobType, SyncJobStatus } from './sync-job.entity';
import { IntegrationsService } from '../integrations/integrations.service';
import { IMarketplaceIntegration } from '../integrations/interfaces/marketplace.interface';
import { MarketplaceAccount } from '../integrations/marketplace-account.entity';
import { ProductsService } from '../products/products.service';
import {
  INITIAL_SYNC_DAYS,
  DAY_IN_MS,
  HISTORY_MONTH_IN_DAYS,
  CATCH_UP_WINDOW_DAYS,
  DAILY_SYNC_DAYS,
} from './sync.constants';

interface SyncJobData {
  jobId: string;
  accountId: string;
  type: SyncJobType;
  params?: any;
}

@Processor('sync')
@Injectable()
export class SyncProcessor {
  private readonly logger = new Logger(SyncProcessor.name);

  constructor(
    @InjectRepository(SyncJob)
    private syncJobsRepository: Repository<SyncJob>,
    private integrationsService: IntegrationsService,
    private productsService: ProductsService,
  ) {}

  @Process('sync-data')
  async handleSync(job: Job<SyncJobData>) {
    const { jobId, accountId, type, params } = job.data;

    this.logger.log(`Starting sync job ${jobId} for account ${accountId}, type: ${type}`);

    const syncJob = await this.syncJobsRepository.findOne({
      where: { id: jobId },
      relations: ['account', 'account.user'],
    });

    if (!syncJob) {
      this.logger.error(`Sync job ${jobId} not found`);
      return;
    }

    // Обновляем статус
    syncJob.status = SyncJobStatus.PROCESSING;
    syncJob.startedAt = new Date();
    await this.syncJobsRepository.save(syncJob);

    try {
      // Получаем экземпляр интеграции
      this.logger.log(`Getting integration instance for account ${accountId}...`);
      const integration = await this.integrationsService.getIntegrationInstance(
        accountId,
        syncJob.account.user.id,
      );
      this.logger.log(`Integration instance obtained and connected for account ${accountId}`);

      // Выполняем синхронизацию в зависимости от типа
      const result = await this.performSync(integration, type, params, syncJob);

      // Обновляем статус на завершенный
      syncJob.status = SyncJobStatus.COMPLETED;
      syncJob.completedAt = new Date();
      syncJob.progress = 100;
      syncJob.result = result;
      syncJob.recordsProcessed = result.recordsProcessed || 0;
      syncJob.totalRecords = result.totalRecords || 0;

      await this.syncJobsRepository.save(syncJob);

      // Обновляем время последней синхронизации аккаунта
      syncJob.account.lastSyncAt = new Date();
      syncJob.account.lastSyncStatus = 'success';
      await this.updateAccountSyncMetadata(syncJob.account, params, result);
      await this.integrationsService.accountsRepository.save(syncJob.account);

      this.logger.log(`Sync job ${jobId} completed successfully`);

      await integration.disconnect();
    } catch (error) {
      this.logger.error(`Sync job ${jobId} failed: ${error.message}`, error.stack);

      syncJob.status = SyncJobStatus.FAILED;
      syncJob.error = error.message;
      syncJob.completedAt = new Date();

      // Обновляем статус аккаунта
      syncJob.account.lastSyncStatus = 'failed';
      await this.integrationsService.accountsRepository.save(syncJob.account);

      await this.syncJobsRepository.save(syncJob);

      // Пробрасываем ошибку для retry механизма Bull
      throw error;
    }
  }

  private async performSync(
    integration: IMarketplaceIntegration,
    type: SyncJobType,
    params: any,
    syncJob: SyncJob,
  ): Promise<any> {
    const result: any = {
      recordsProcessed: 0,
      totalRecords: 0,
      data: {},
    };

    switch (type) {
      case SyncJobType.SALES:
        syncJob.progress = 10;
        await this.syncJobsRepository.save(syncJob);

        const sales = await integration.getSales({
          startDate: params?.startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          endDate: params?.endDate || new Date(),
          limit: params?.limit || 10000,
        });

        result.data.sales = sales;
        result.recordsProcessed = sales.length;
        result.totalRecords = sales.length;
        break;

      case SyncJobType.PRODUCTS:
        syncJob.progress = 20;
        await this.syncJobsRepository.save(syncJob);

        const products = await integration.getProducts({
          limit: params?.limit || 10000,
        });

        result.data.products = products;
        result.recordsProcessed = products.length;
        result.totalRecords = products.length;
        break;

      case SyncJobType.STOCK:
        syncJob.progress = 30;
        await this.syncJobsRepository.save(syncJob);

        const stock = await integration.getStock();

        result.data.stock = stock;
        result.recordsProcessed = stock.length;
        result.totalRecords = stock.length;
        break;

      case SyncJobType.ORDERS:
        syncJob.progress = 40;
        await this.syncJobsRepository.save(syncJob);

        const orders = await integration.getOrders({
          startDate: params?.startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          endDate: params?.endDate || new Date(),
          limit: params?.limit || 10000,
        });

        result.data.orders = orders;
        result.recordsProcessed = orders.length;
        result.totalRecords = orders.length;
        break;

      case SyncJobType.REGIONAL:
        syncJob.progress = 50;
        await this.syncJobsRepository.save(syncJob);

        const regional = await integration.getRegionalData({
          startDate: params?.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          endDate: params?.endDate || new Date(),
        });

        result.data.regional = regional;
        result.recordsProcessed = regional.length;
        result.totalRecords = regional.length;
        break;

      case SyncJobType.FULL:
        await this.runFullSyncSequentially(integration, syncJob, result, params);
        break;

      default:
        throw new Error(`Unknown sync type: ${type}`);
    }

    return result;
  }

  private async runFullSyncSequentially(
    integration: IMarketplaceIntegration,
    syncJob: SyncJob,
    result: any,
    params?: any,
  ) {
    const { startDate, endDate, mode } = this.resolveFullSyncRange(params);

    const stages: Array<{
      key: string;
      progress: number;
      loader: () => Promise<any>;
    }> = [
      {
        key: 'products',
        progress: 20,
        loader: () => integration.getProducts({ limit: 10000 }),
      },
      {
        key: 'stock',
        progress: 40,
        loader: () => integration.getStock(),
      },
      {
        key: 'sales',
        progress: 60,
        loader: () =>
          integration.getSales({
            startDate,
            endDate,
            limit: 10000,
          }),
      },
      {
        key: 'orders',
        progress: 80,
        loader: () =>
          integration.getOrders({
            startDate,
            endDate,
            limit: 10000,
          }),
      },
      {
        key: 'regional',
        progress: 100,
        loader: () =>
          integration.getRegionalData({
            startDate,
            endDate,
          }),
      },
    ];

    result.data = {};
    result.metadata = {
      rangeStart: startDate.toISOString(),
      rangeEnd: endDate.toISOString(),
      mode,
    };
    let processed = 0;

    for (const stage of stages) {
      const data = await stage.loader();
      result.data[stage.key] = data;

      // Сохраняем данные в БД
      try {
        await this.saveStageData(stage.key, data, syncJob.account, syncJob.account.user.id);
      } catch (error) {
        this.logger.warn(`Failed to save ${stage.key} data: ${error.message}`);
      }

      if (Array.isArray(data)) {
        processed += data.length;
      } else if (data?.recordsProcessed) {
        processed += data.recordsProcessed;
      }

      syncJob.progress = stage.progress;
      syncJob.recordsProcessed = processed;
      syncJob.totalRecords = processed;
      await this.syncJobsRepository.save(syncJob);
    }

    result.recordsProcessed = processed;
    result.totalRecords = processed;
  }

  private async saveStageData(
    stageKey: string,
    data: any,
    account: MarketplaceAccount,
    userId: string,
  ): Promise<void> {
    this.logger.log(`Saving ${stageKey} data for account ${account.id}, records: ${Array.isArray(data) ? data.length : 'N/A'}`);
    
    switch (stageKey) {
      case 'sales':
        if (Array.isArray(data) && data.length > 0) {
          // Определяем диапазон дат из данных
          const dates = data.map((s: any) => new Date(s.date)).filter(Boolean);
          if (dates.length > 0) {
            const startDate = new Date(Math.min(...dates.map((d: Date) => d.getTime())));
            const endDate = new Date(Math.max(...dates.map((d: Date) => d.getTime())));
            this.logger.log(`Saving ${data.length} sales records from ${startDate.toISOString()} to ${endDate.toISOString()}`);
            const result = await this.productsService.syncSalesFromMarketplace(
              account.id,
              userId,
              startDate,
              endDate,
            );
            this.logger.log(`Saved ${result.created} sales records to database`);
          } else {
            this.logger.warn(`No valid dates found in sales data`);
          }
        } else {
          this.logger.warn(`Sales data is empty or not an array`);
        }
        break;
      case 'products':
        if (Array.isArray(data) && data.length > 0) {
          this.logger.log(`Saving ${data.length} products`);
          const result = await this.productsService.syncProductsFromMarketplace(account.id, userId);
          this.logger.log(`Products sync result: ${result.created} created, ${result.updated} updated`);
        } else {
          this.logger.warn(`Products data is empty or not an array`);
        }
        break;
      case 'stock':
        if (Array.isArray(data) && data.length > 0) {
          // Для остатков нужно обновить каждый товар
          // Это уже делается в syncProductsFromMarketplace, но можно добавить отдельную логику
          this.logger.log(`Stock data received: ${data.length} records`);
          // Stock обновляется вместе с products, поэтому просто логируем
        } else {
          this.logger.warn(`Stock data is empty or not an array`);
        }
        break;
      // orders и regional не требуют отдельного сохранения, они используются для аналитики
      default:
        this.logger.debug(`Stage ${stageKey} does not require database saving`);
        break;
    }
  }

  private async delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private resolveFullSyncRange(params?: any) {
    const mode = params?.mode || 'INITIAL';
    const now = new Date();
    const endDate = params?.endDate ? new Date(params.endDate) : now;

    let defaultRange: number;
    switch (mode) {
      case 'DELTA':
        defaultRange = DAILY_SYNC_DAYS * DAY_IN_MS;
        break;
      case 'CATCH_UP':
        defaultRange = CATCH_UP_WINDOW_DAYS * DAY_IN_MS;
        break;
      default:
        defaultRange = INITIAL_SYNC_DAYS * DAY_IN_MS;
    }

    const startDate = params?.startDate
      ? new Date(params.startDate)
      : new Date(endDate.getTime() - defaultRange);

    return { startDate, endDate, mode };
  }

  private calculateDesiredHistoryStart(reference: Date = new Date()): Date {
    const desired = new Date(reference);
    desired.setTime(desired.getTime() - HISTORY_MONTH_IN_DAYS * DAY_IN_MS);
    return desired;
  }

  private async updateAccountSyncMetadata(
    account: MarketplaceAccount,
    params: any,
    result: any,
  ) {
    if (!result?.metadata) {
      return;
    }

    const metadata = account.metadata || {};
    const syncState = metadata.syncState || {};
    const mode = params?.mode || result.metadata.mode || 'INITIAL';
    const rangeStart = result.metadata.rangeStart ? new Date(result.metadata.rangeStart) : null;
    const rangeEnd = result.metadata.rangeEnd ? new Date(result.metadata.rangeEnd) : null;

    if (!syncState.desiredHistoryStart) {
      const reference = rangeEnd || new Date();
      syncState.desiredHistoryStart = this.calculateDesiredHistoryStart(reference).toISOString();
    }

    switch (mode) {
      case 'INITIAL':
        syncState.initialCompleted = true;
        if (rangeStart) {
          syncState.oldestSyncedDate = rangeStart.toISOString();
        }
        break;
      case 'CATCH_UP':
        if (rangeStart) {
          if (
            !syncState.oldestSyncedDate ||
            new Date(syncState.oldestSyncedDate).getTime() > rangeStart.getTime()
          ) {
            syncState.oldestSyncedDate = rangeStart.toISOString();
          }

          const desired = syncState.desiredHistoryStart
            ? new Date(syncState.desiredHistoryStart)
            : this.calculateDesiredHistoryStart(rangeStart);

          syncState.fullHistoryReady = rangeStart.getTime() <= desired.getTime();
        }
        break;
      case 'DELTA':
        if (rangeEnd) {
          syncState.lastDailySyncAt = rangeEnd.toISOString();
        }
        break;
      default:
        break;
    }

    syncState.lastSyncAt = new Date().toISOString();
    metadata.syncState = syncState;
    account.metadata = metadata;
  }
}

