import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { MarketplaceAccount } from './marketplace-account.entity';

export enum WebhookEventType {
  ORDER_CREATED = 'order_created',
  ORDER_UPDATED = 'order_updated',
  ORDER_CANCELLED = 'order_cancelled',
  PRODUCT_UPDATED = 'product_updated',
  STOCK_UPDATED = 'stock_updated',
  PRICE_UPDATED = 'price_updated',
  REVIEW_RECEIVED = 'review_received',
  CUSTOM = 'custom',
}

export enum WebhookEventStatus {
  PENDING = 'pending',
  PROCESSED = 'processed',
  FAILED = 'failed',
  IGNORED = 'ignored',
  DELIVERED = 'delivered',
}

@Entity('webhook_events')
@Index(['account', 'status', 'createdAt'])
export class WebhookEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => MarketplaceAccount, { onDelete: 'CASCADE' })
  account: MarketplaceAccount;

  @Column({
    type: 'enum',
    enum: WebhookEventType,
  })
  type: WebhookEventType;

  @Column({
    type: 'enum',
    enum: WebhookEventStatus,
    default: WebhookEventStatus.PENDING,
  })
  status: WebhookEventStatus;

  @Column({ type: 'json' })
  payload: any; // Данные события

  @Column({ type: 'text', nullable: true })
  error: string; // Ошибка обработки

  @Column({ type: 'int', default: 0 })
  retryCount: number;

  @Column({ type: 'int', default: 3 })
  maxRetries: number;

  @Column({ nullable: true })
  processedAt: Date;

  @Column({ nullable: true })
  deliveredAt: Date;

  @Column({ type: 'int', nullable: true })
  responseStatus: number;

  @Column({ type: 'json', nullable: true })
  responseData: any;

  @Column({ type: 'text', nullable: true })
  lastError: string;

  @Column({ type: 'json', nullable: true })
  metadata: any; // Дополнительные метаданные

  @CreateDateColumn()
  createdAt: Date;
}

