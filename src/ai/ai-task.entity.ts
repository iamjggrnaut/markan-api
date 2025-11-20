import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { User } from '../users/user.entity';
import { Organization } from '../organizations/organization.entity';
import { Product } from '../products/product.entity';

export enum AITaskType {
  DEMAND_FORECAST = 'demand_forecast',
  PRICE_RECOMMENDATION = 'price_recommendation',
  ASSORTMENT_EXPANSION = 'assortment_expansion',
  ANOMALY_DETECTION = 'anomaly_detection',
  CUSTOMER_SEGMENTATION = 'customer_segmentation',
  CHURN_PREDICTION = 'churn_prediction',
}

export enum AITaskStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

@Entity('ai_tasks')
@Index(['user', 'status', 'createdAt'])
export class AITask {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  user: User;

  @ManyToOne(() => Organization, { nullable: true, onDelete: 'CASCADE' })
  organization: Organization;

  @Column({
    type: 'enum',
    enum: AITaskType,
  })
  type: AITaskType;

  @Column({
    type: 'enum',
    enum: AITaskStatus,
    default: AITaskStatus.PENDING,
  })
  status: AITaskStatus;

  @Column({ type: 'json', nullable: true })
  inputParams: any; // Входные параметры для AI задачи

  @Column({ type: 'json', nullable: true })
  result: any; // Результат выполнения

  @Column({ type: 'text', nullable: true })
  error: string; // Ошибка при выполнении

  @Column({ type: 'int', default: 0 })
  progress: number; // Прогресс выполнения (0-100)

  @Column({ nullable: true })
  startedAt: Date;

  @Column({ nullable: true })
  completedAt: Date;

  @ManyToOne(() => Product, { nullable: true, onDelete: 'SET NULL' })
  product: Product; // Если задача связана с товаром

  @Column({ nullable: true })
  productId: string;

  @Column({ type: 'json', nullable: true })
  metadata: any;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

