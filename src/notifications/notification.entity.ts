import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { User } from '../users/user.entity';
import { Organization } from '../organizations/organization.entity';

export enum NotificationType {
  LOW_STOCK = 'low_stock',
  SALES_DROP = 'sales_drop',
  PRICE_CHANGE = 'price_change',
  NEW_ORDER = 'new_order',
  ANOMALY_DETECTED = 'anomaly_detected',
  COMPETITOR_PRICE_CHANGE = 'competitor_price_change',
  REPORT_READY = 'report_ready',
  SYNC_COMPLETED = 'sync_completed',
  SYNC_FAILED = 'sync_failed',
}

export enum NotificationChannel {
  EMAIL = 'email',
  PUSH = 'push',
  TELEGRAM = 'telegram',
  IN_APP = 'in_app',
}

export enum NotificationStatus {
  PENDING = 'pending',
  SENT = 'sent',
  FAILED = 'failed',
  READ = 'read',
}

@Entity('notifications')
@Index(['user', 'status', 'createdAt'])
@Index(['user', 'isRead'])
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  user: User;

  @ManyToOne(() => Organization, { nullable: true, onDelete: 'CASCADE' })
  organization: Organization;

  @Column({
    type: 'enum',
    enum: NotificationType,
  })
  type: NotificationType;

  @Column({
    type: 'enum',
    enum: NotificationChannel,
  })
  channel: NotificationChannel;

  @Column()
  title: string; // Заголовок уведомления

  @Column({ type: 'text' })
  message: string; // Текст уведомления

  @Column({
    type: 'enum',
    enum: NotificationStatus,
    default: NotificationStatus.PENDING,
  })
  status: NotificationStatus;

  @Column({ default: false })
  isRead: boolean; // Прочитано ли уведомление

  @Column({ nullable: true })
  readAt: Date; // Дата прочтения

  @Column({ nullable: true })
  sentAt: Date; // Дата отправки

  @Column({ type: 'json', nullable: true })
  data: any; // Дополнительные данные

  @Column({ type: 'json', nullable: true })
  metadata: any; // Метаданные

  @CreateDateColumn()
  createdAt: Date;
}

