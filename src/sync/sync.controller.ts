import {
  Controller,
  Get,
  Post,
  Param,
  Delete,
  UseGuards,
  Request,
  Query,
  Body,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { SyncService } from './sync.service';
import { SyncJobType } from './sync-job.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { IntegrationsService } from '../integrations/integrations.service';

@ApiTags('Sync')
@Controller('sync')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class SyncController {
  constructor(
    private readonly syncService: SyncService,
    private readonly integrationsService: IntegrationsService,
  ) {}

  @Post('accounts/:accountId')
  @ApiOperation({ summary: 'Запустить синхронизацию для аккаунта' })
  async startSync(
    @Request() req,
    @Param('accountId') accountId: string,
    @Body('type') type?: string,
    @Body('params') params?: any,
  ) {
    // Проверяем доступ к аккаунту
    await this.integrationsService.findOne(accountId, req.user.userId);

    const jobType = this.normalizeJobType(type);

    return this.syncService.createSyncJob(accountId, jobType, params);
  }

  @Get('accounts/:accountId/jobs')
  @ApiOperation({ summary: 'Получить историю задач синхронизации' })
  async getSyncJobs(
    @Request() req,
    @Param('accountId') accountId: string,
    @Query('limit') limit?: number,
  ) {
    await this.integrationsService.findOne(accountId, req.user.userId);

    return this.syncService.getSyncJobs(
      accountId,
      limit ? parseInt(limit.toString()) : 50,
    );
  }

  @Get('accounts/:accountId/statistics')
  @ApiOperation({ summary: 'Получить статистику синхронизации' })
  async getStatistics(@Request() req, @Param('accountId') accountId: string) {
    await this.integrationsService.findOne(accountId, req.user.userId);

    return this.syncService.getSyncStatistics(accountId);
  }

  @Get('jobs/:jobId')
  @ApiOperation({ summary: 'Получить задачу синхронизации по ID' })
  async getSyncJob(@Request() req, @Param('jobId') jobId: string) {
    const job = await this.syncService.getSyncJob(jobId);

    // Проверяем доступ
    await this.integrationsService.findOne(job.account.id, req.user.userId);

    return job;
  }

  @Post('jobs/:jobId/retry')
  @ApiOperation({ summary: 'Повторить неудачную задачу синхронизации' })
  async retryJob(@Request() req, @Param('jobId') jobId: string) {
    const job = await this.syncService.getSyncJob(jobId);

    // Проверяем доступ
    await this.integrationsService.findOne(job.account.id, req.user.userId);

    return this.syncService.retryFailedJob(jobId);
  }

  @Delete('jobs/:jobId')
  @ApiOperation({ summary: 'Отменить задачу синхронизации' })
  async cancelJob(@Request() req, @Param('jobId') jobId: string) {
    const job = await this.syncService.getSyncJob(jobId);

    // Проверяем доступ
    await this.integrationsService.findOne(job.account.id, req.user.userId);

    await this.syncService.cancelSyncJob(jobId);
    return { message: 'Sync job cancelled' };
  }

  private normalizeJobType(value?: string): SyncJobType {
    const fallback = SyncJobType.FULL;
    if (!value) {
      return fallback;
    }

    const normalized = value.toLowerCase() as SyncJobType;
    if ((Object.values(SyncJobType) as string[]).includes(normalized)) {
      return normalized;
    }

    return fallback;
  }
}

