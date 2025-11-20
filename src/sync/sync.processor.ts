import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SyncJob, SyncJobType, SyncJobStatus } from './sync-job.entity';
import { IntegrationsService } from '../integrations/integrations.service';
import { IMarketplaceIntegration } from '../integrations/interfaces/marketplace.interface';

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
  ) {}

  @Process('sync-data')
  async handleSync(job: Job<SyncJobData>) {
    const { jobId, accountId, type, params } = job.data;

    this.logger.log(`Starting sync job ${jobId} for account ${accountId}, type: ${type}`);

    const syncJob = await this.syncJobsRepository.findOne({
      where: { id: jobId },
      relations: ['account'],
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
      const integration = await this.integrationsService.getIntegrationInstance(
        accountId,
        syncJob.account.user.id,
      );

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
        // Полная синхронизация всех данных
        syncJob.progress = 10;
        await this.syncJobsRepository.save(syncJob);

        const [salesData, productsData, stockData, ordersData, regionalData] = await Promise.all([
          integration.getSales({
            startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
            endDate: new Date(),
            limit: 10000,
          }),
          integration.getProducts({ limit: 10000 }),
          integration.getStock(),
          integration.getOrders({
            startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
            endDate: new Date(),
            limit: 10000,
          }),
          integration.getRegionalData({
            startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
            endDate: new Date(),
          }),
        ]);

        result.data = {
          sales: salesData,
          products: productsData,
          stock: stockData,
          orders: ordersData,
          regional: regionalData,
        };

        result.recordsProcessed =
          salesData.length +
          productsData.length +
          stockData.length +
          ordersData.length +
          regionalData.length;

        result.totalRecords = result.recordsProcessed;
        syncJob.progress = 100;
        await this.syncJobsRepository.save(syncJob);
        break;

      default:
        throw new Error(`Unknown sync type: ${type}`);
    }

    return result;
  }
}

