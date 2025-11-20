import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { Competitor } from './competitor.entity';
import { Product } from '../products/product.entity';

export enum PromotionType {
  DISCOUNT = 'discount',
  PROMO_CODE = 'promo_code',
  BUNDLE = 'bundle',
  FREE_SHIPPING = 'free_shipping',
  GIFT = 'gift',
}

@Entity('competitor_promotions')
@Index(['competitor', 'startDate', 'endDate'])
export class CompetitorPromotion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Competitor, { onDelete: 'CASCADE' })
  competitor: Competitor;

  @ManyToOne(() => Product, { nullable: true, onDelete: 'SET NULL' })
  product: Product; // Наш товар для сравнения

  @Column({ nullable: true })
  productId: string;

  @Column()
  competitorProductId: string; // ID товара у конкурента

  @Column({
    type: 'enum',
    enum: PromotionType,
  })
  type: PromotionType;

  @Column()
  title: string; // Название акции

  @Column({ type: 'text', nullable: true })
  description: string; // Описание акции

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  discountPercent: number; // Процент скидки

  @Column({ type: 'date' })
  startDate: Date; // Дата начала акции

  @Column({ type: 'date', nullable: true })
  endDate: Date; // Дата окончания акции

  @Column({ default: true })
  isActive: boolean; // Активна ли акция

  @Column({ type: 'json', nullable: true })
  metadata: any; // Дополнительные данные

  @CreateDateColumn()
  createdAt: Date;
}

