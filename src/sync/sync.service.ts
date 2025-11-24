import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SyncJob, SyncJobType, SyncJobStatus } from './sync-job.entity';
import { IntegrationsService } from '../integrations/integrations.service';
import { AccountStatus, MarketplaceAccount } from '../integrations/marketplace-account.entity';
import {
  INITIAL_SYNC_DAYS,
  DAY_IN_MS,
  CATCH_UP_WINDOW_DAYS,
  DAILY_SYNC_DAYS,
  HISTORY_MONTH_IN_DAYS,
} from './sync.constants';

@Injectable()
export class SyncService {
  constructor(
    @InjectRepository(SyncJob)
    private syncJobsRepository: Repository<SyncJob>,
    @InjectQueue('sync')
    private syncQueue: Queue,
    private integrationsService: IntegrationsService,
  ) {}

  async createSyncJob(
    accountId: string,
    type: SyncJobType,
    params?: any,
  ): Promise<SyncJob> {
    const account = await this.integrationsService.accountsRepository.findOne({
      where: { id: accountId },
    });

    if (!account) {
      throw new NotFoundException(`Account with ID ${accountId} not found`);
    }

    const syncJob = this.syncJobsRepository.create({
      account,
      type,
      status: SyncJobStatus.PENDING,
      params,
    });

    const savedJob = await this.syncJobsRepository.save(syncJob);

    // Добавляем задачу в очередь
    await this.syncQueue.add('sync-data', {
      jobId: savedJob.id,
      accountId,
      type,
      params,
    });

    return savedJob;
  }

  async getSyncJobs(
    accountId: string,
    limit: number = 50,
  ): Promise<SyncJob[]> {
    return this.syncJobsRepository.find({
      where: { account: { id: accountId } },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  async getSyncJob(jobId: string): Promise<SyncJob> {
    const job = await this.syncJobsRepository.findOne({
      where: { id: jobId },
      relations: ['account'],
    });

    if (!job) {
      throw new NotFoundException(`Sync job with ID ${jobId} not found`);
    }

    return job;
  }

  async cancelSyncJob(jobId: string): Promise<void> {
    const job = await this.getSyncJob(jobId);

    if (job.status === SyncJobStatus.PROCESSING) {
      // Пытаемся отменить задачу в очереди
      const queueJob = await this.syncQueue.getJob(jobId);
      if (queueJob) {
        await queueJob.remove();
      }
    }

    job.status = SyncJobStatus.CANCELLED;
    await this.syncJobsRepository.save(job);
  }

  async retryFailedJob(jobId: string): Promise<SyncJob> {
    const job = await this.getSyncJob(jobId);

    if (job.status !== SyncJobStatus.FAILED) {
      throw new Error('Only failed jobs can be retried');
    }

    job.status = SyncJobStatus.PENDING;
    job.error = null;
    job.retryCount += 1;
    await this.syncJobsRepository.save(job);

    // Добавляем задачу в очередь снова
    await this.syncQueue.add('sync-data', {
      jobId: job.id,
      accountId: job.account.id,
      type: job.type,
      params: job.params,
    });

    return job;
  }

  // Периодическая синхронизация активных аккаунтов
  @Cron(CronExpression.EVERY_HOUR)
  async syncActiveAccounts() {
    await this.scheduleAutoSyncJobs();
  }

  // Ежедневная полная синхронизация
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async fullSyncAllAccounts() {
    await this.scheduleAutoSyncJobs();
  }

  // Синхронизация остатков каждые 30 минут
  @Cron('0 */30 * * * *')
  async syncStock() {
    const activeAccounts = await this.integrationsService.accountsRepository.find({
      where: { status: AccountStatus.ACTIVE },
    });

    for (const account of activeAccounts) {
      const syncSettings = account.syncSettings || {};
      if (syncSettings.autoSyncStock === false) {
        continue;
      }

      await this.createSyncJob(account.id, SyncJobType.STOCK, {
        scheduled: true,
      });
    }
  }

  async getSyncStatistics(accountId: string): Promise<any> {
    const jobs = await this.syncJobsRepository.find({
      where: { account: { id: accountId } },
      order: { createdAt: 'DESC' },
      take: 100,
    });

    const stats = {
      total: jobs.length,
      completed: jobs.filter((j) => j.status === SyncJobStatus.COMPLETED).length,
      failed: jobs.filter((j) => j.status === SyncJobStatus.FAILED).length,
      pending: jobs.filter((j) => j.status === SyncJobStatus.PENDING).length,
      processing: jobs.filter((j) => j.status === SyncJobStatus.PROCESSING).length,
      lastSync: jobs.find((j) => j.status === SyncJobStatus.COMPLETED)?.completedAt || null,
      averageDuration: this.calculateAverageDuration(jobs),
    };

    return stats;
  }

  private async scheduleAutoSyncJobs() {
    const activeAccounts = await this.integrationsService.accountsRepository.find({
      where: { status: AccountStatus.ACTIVE },
    });
    const now = new Date();

    for (const account of activeAccounts) {
      if (!this.shouldAutoSync(account)) {
        continue;
      }

      if (await this.hasActiveJob(account.id)) {
        continue;
      }

      const params = this.buildNextSyncParams(account, now);
      if (!params) {
        continue;
      }

      await this.createSyncJob(account.id, SyncJobType.FULL, params);
    }
  }

  private shouldAutoSync(account: MarketplaceAccount): boolean {
    const syncSettings = account.syncSettings || {};
    return syncSettings.autoSync !== false;
  }

  private async hasActiveJob(accountId: string): Promise<boolean> {
    const activeJob = await this.syncJobsRepository.findOne({
      where: [
        {
          account: { id: accountId },
          status: SyncJobStatus.PROCESSING,
        },
        {
          account: { id: accountId },
          status: SyncJobStatus.PENDING,
        },
      ],
    });

    return Boolean(activeJob);
  }

  private buildNextSyncParams(account: MarketplaceAccount, now: Date) {
    const syncState = (account.metadata?.syncState as any) || {};

    if (!syncState.initialCompleted) {
      return this.buildInitialRange(now);
    }

    const catchUpRange = this.buildCatchUpRange(syncState);
    if (catchUpRange) {
      return catchUpRange;
    }

    return this.buildDeltaRange(syncState, now);
  }

  private buildInitialRange(now: Date) {
    const end = now;
    const start = new Date(end.getTime() - INITIAL_SYNC_DAYS * DAY_IN_MS);

    return {
      scheduled: true,
      mode: 'INITIAL',
      startDate: start.toISOString(),
      endDate: end.toISOString(),
    };
  }

  private buildCatchUpRange(syncState: any) {
    if (syncState.fullHistoryReady) {
      return null;
    }

    const desired =
      syncState.desiredHistoryStart !== undefined
        ? new Date(syncState.desiredHistoryStart)
        : new Date(Date.now() - HISTORY_MONTH_IN_DAYS * DAY_IN_MS);

    if (!syncState.oldestSyncedDate) {
      return null;
    }

    const oldestSynced = new Date(syncState.oldestSyncedDate);

    if (oldestSynced.getTime() <= desired.getTime()) {
      return null;
    }

    const endDate = new Date(oldestSynced.getTime() - 1);

    if (endDate.getTime() <= desired.getTime()) {
      return null;
    }

    const startDate = new Date(
      Math.max(endDate.getTime() - CATCH_UP_WINDOW_DAYS * DAY_IN_MS, desired.getTime()),
    );

    return {
      scheduled: true,
      mode: 'CATCH_UP',
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    };
  }

  private buildDeltaRange(syncState: any, now: Date) {
    const interval = DAILY_SYNC_DAYS * DAY_IN_MS;
    const lastDelta = syncState.lastDailySyncAt ? new Date(syncState.lastDailySyncAt) : null;

    if (lastDelta) {
      if (now.getTime() - lastDelta.getTime() < interval) {
        return null;
      }

      return {
        scheduled: true,
        mode: 'DELTA',
        startDate: lastDelta.toISOString(),
        endDate: now.toISOString(),
      };
    }

    const startDate = new Date(now.getTime() - interval);
    return {
      scheduled: true,
      mode: 'DELTA',
      startDate: startDate.toISOString(),
      endDate: now.toISOString(),
    };
  }

  private calculateAverageDuration(jobs: SyncJob[]): number | null {
    const completedJobs = jobs.filter(
      (j) => j.status === SyncJobStatus.COMPLETED && j.startedAt && j.completedAt,
    );

    if (completedJobs.length === 0) {
      return null;
    }

    const totalDuration = completedJobs.reduce((sum, job) => {
      const duration = job.completedAt.getTime() - job.startedAt.getTime();
      return sum + duration;
    }, 0);

    return Math.round(totalDuration / completedJobs.length / 1000); // В секундах
  }
}

