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

    let integration: IMarketplaceIntegration | null = null;
    try {
      // Получаем экземпляр интеграции
      this.logger.log(`Getting integration instance for account ${accountId}...`);
      integration = await this.integrationsService.getIntegrationInstance(
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
      syncJob.account.lastSyncStatus = result.partialSuccess ? 'partial' : 'success';
      await this.updateAccountSyncMetadata(syncJob.account, params, result);
      await this.integrationsService.accountsRepository.save(syncJob.account);

      this.logger.log(`Sync job ${jobId} completed ${result.partialSuccess ? 'with partial success' : 'successfully'}`);

      // Отключаем интеграцию только после завершения всех этапов
      if (integration) {
        await integration.disconnect();
      }
    } catch (error) {
      this.logger.error(`Sync job ${jobId} failed: ${error.message}`, error.stack);

      syncJob.status = SyncJobStatus.FAILED;
      syncJob.error = error.message;
      syncJob.completedAt = new Date();

      // Обновляем статус аккаунта
      syncJob.account.lastSyncStatus = 'failed';
      await this.integrationsService.accountsRepository.save(syncJob.account);

      await this.syncJobsRepository.save(syncJob);

      // Отключаем интеграцию даже в случае ошибки
      if (integration) {
        try {
          await integration.disconnect();
        } catch (disconnectError) {
          this.logger.warn(`Failed to disconnect integration: ${disconnectError.message}`);
        }
      }

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
      required: boolean; // Критичность этапа
    }> = [
      {
        key: 'products',
        progress: 20,
        loader: () => integration.getProducts({ limit: 10000 }),
        required: true,
      },
      {
        key: 'stock',
        progress: 40,
        loader: () => integration.getStock(),
        required: false, // Stock может быть недоступен из-за прав доступа
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
        required: true,
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
        required: false,
      },
      {
        key: 'regional',
        progress: 100,
        loader: () =>
          integration.getRegionalData({
            startDate,
            endDate,
          }),
        required: false,
      },
    ];

    result.data = {};
    result.errors = {};
    result.partialSuccess = false;
    result.metadata = {
      rangeStart: startDate.toISOString(),
      rangeEnd: endDate.toISOString(),
      mode,
    };
    let processed = 0;

    for (const stage of stages) {
      try {
        this.logger.log(`Starting ${stage.key} sync stage...`);
        const data = await stage.loader();
        result.data[stage.key] = data;

        // Сохраняем данные в БД
        try {
          await this.saveStageData(stage.key, data, syncJob.account, syncJob.account.user.id);
        } catch (error) {
          this.logger.warn(`Failed to save ${stage.key} data: ${error.message}`);
          result.errors[`${stage.key}_save`] = error.message;
          result.partialSuccess = true;
          
          // Если это критичный этап, пробрасываем ошибку
          if (stage.required) {
            throw new Error(`Failed to save required stage ${stage.key}: ${error.message}`);
          }
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
        
        this.logger.log(`Completed ${stage.key} sync stage: ${Array.isArray(data) ? data.length : 'N/A'} records`);
      } catch (error) {
        this.logger.error(`Failed ${stage.key} sync stage: ${error.message}`, error.stack);
        result.errors[stage.key] = error.message;
        result.partialSuccess = true;
        
        // Если это критичный этап, пробрасываем ошибку
        if (stage.required) {
          throw new Error(`Required sync stage ${stage.key} failed: ${error.message}`);
        }
        
        // Для некритичных этапов продолжаем синхронизацию
        this.logger.warn(`Skipping ${stage.key} stage due to error, continuing with other stages...`);
        result.data[stage.key] = [];
      }
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
    
    try {
      switch (stageKey) {
        case 'sales':
          if (Array.isArray(data) && data.length > 0) {
            this.logger.log(`Saving ${data.length} sales records`);
            const result = await this.productsService.saveSales(account, data);
            this.logger.log(`Saved ${result.created} sales records to database`);
          } else {
            this.logger.warn(`Sales data is empty or not an array`);
          }
          break;
        case 'products':
          if (Array.isArray(data) && data.length > 0) {
            this.logger.log(`Saving ${data.length} products`);
            const result = await this.productsService.saveProducts(account, data);
            this.logger.log(`Products saved: ${result.created} created, ${result.updated} updated`);
          } else {
            this.logger.warn(`Products data is empty or not an array`);
          }
          break;
        case 'stock':
          if (Array.isArray(data) && data.length > 0) {
            this.logger.log(`Saving ${data.length} stock records`);
            const result = await this.productsService.saveStock(account, data);
            this.logger.log(`Stock updated for ${result.updated} products`);
          } else {
            this.logger.warn(`Stock data is empty or not an array`);
          }
          break;
        case 'orders':
          if (Array.isArray(data) && data.length > 0) {
            this.logger.log(`Received ${data.length} orders (saved as sales)`);
            // Orders обычно сохраняются как sales, но можно добавить отдельную логику в будущем
            const result = await this.productsService.saveOrders(account, data);
            this.logger.log(`Orders processed: ${result.saved} records`);
          } else {
            this.logger.warn(`Orders data is empty or not an array`);
          }
          break;
        // regional не требует отдельного сохранения, используется для аналитики
        default:
          this.logger.debug(`Stage ${stageKey} does not require database saving`);
          break;
      }
    } catch (error) {
      this.logger.error(`Failed to save ${stageKey} data: ${error.message}`, error.stack);
      throw error;
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

