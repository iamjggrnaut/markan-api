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
import { Product } from '../products/product.entity';

export enum RecommendationType {
  PRICE = 'price',
  DEMAND = 'demand',
  ASSORTMENT = 'assortment',
  ANOMALY = 'anomaly',
  CUSTOMER = 'customer',
}

@Entity('ai_recommendations')
@Index(['user', 'type', 'createdAt'])
@Index(['product', 'type'])
export class AIRecommendation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  user: User;

  @ManyToOne(() => Organization, { nullable: true, onDelete: 'CASCADE' })
  organization: Organization;

  @ManyToOne(() => Product, { nullable: true, onDelete: 'CASCADE' })
  product: Product;

  @Column({ nullable: true })
  productId: string;

  @Column({
    type: 'enum',
    enum: RecommendationType,
  })
  type: RecommendationType;

  @Column()
  title: string; // Название рекомендации

  @Column({ type: 'text' })
  description: string; // Описание рекомендации

  @Column({ type: 'json' })
  data: any; // Данные рекомендации (цена, прогноз, etc.)

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  confidence: number; // Уверенность AI (0-100)

  @Column({ default: false })
  isRead: boolean; // Прочитана ли рекомендация

  @Column({ default: false })
  isApplied: boolean; // Применена ли рекомендация

  @Column({ type: 'json', nullable: true })
  metadata: any;

  @CreateDateColumn()
  createdAt: Date;
}

