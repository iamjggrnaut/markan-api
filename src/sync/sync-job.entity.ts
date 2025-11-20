import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { MarketplaceAccount } from '../integrations/marketplace-account.entity';

export enum SyncJobType {
  SALES = 'sales',
  PRODUCTS = 'products',
  STOCK = 'stock',
  ORDERS = 'orders',
  REGIONAL = 'regional',
  FULL = 'full', // Полная синхронизация
}

export enum SyncJobStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

@Entity('sync_jobs')
@Index(['account', 'status', 'createdAt'])
export class SyncJob {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => MarketplaceAccount, { onDelete: 'CASCADE' })
  account: MarketplaceAccount;

  @Column({
    type: 'enum',
    enum: SyncJobType,
  })
  type: SyncJobType;

  @Column({
    type: 'enum',
    enum: SyncJobStatus,
    default: SyncJobStatus.PENDING,
  })
  status: SyncJobStatus;

  @Column({ type: 'json', nullable: true })
  params: any; // Параметры синхронизации

  @Column({ type: 'int', default: 0 })
  progress: number; // Прогресс в процентах

  @Column({ type: 'int', default: 0 })
  recordsProcessed: number; // Количество обработанных записей

  @Column({ type: 'int', nullable: true })
  totalRecords: number; // Общее количество записей

  @Column({ type: 'text', nullable: true })
  error: string; // Ошибка при выполнении

  @Column({ type: 'int', default: 0 })
  retryCount: number; // Количество попыток

  @Column({ nullable: true })
  startedAt: Date; // Время начала

  @Column({ nullable: true })
  completedAt: Date; // Время завершения

  @Column({ type: 'json', nullable: true })
  result: any; // Результат синхронизации

  @Column({ type: 'json', nullable: true })
  metadata: any; // Дополнительные метаданные

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

