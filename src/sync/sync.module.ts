import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { ScheduleModule } from '@nestjs/schedule';
import { SyncService } from './sync.service';
import { SyncController } from './sync.controller';
import { SyncJob } from './sync-job.entity';
import { SyncProcessor } from './sync.processor';
import { IntegrationsModule } from '../integrations/integrations.module';
import { MarketplaceAccount } from '../integrations/marketplace-account.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([SyncJob, MarketplaceAccount]),
    BullModule.registerQueue({
      name: 'sync',
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: 100, // Хранить последние 100 завершенных задач
        removeOnFail: 500, // Хранить последние 500 неудачных задач
      },
    }),
    ScheduleModule.forRoot(),
    IntegrationsModule,
  ],
  controllers: [SyncController],
  providers: [SyncService, SyncProcessor],
  exports: [SyncService],
})
export class SyncModule {}

