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

@Entity('competitor_products')
@Index(['competitor', 'product', 'date'])
export class CompetitorProduct {
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

  @Column()
  competitorProductName: string; // Название товара у конкурента

  @Column({ nullable: true })
  competitorSku: string; // SKU товара у конкурента

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  price: number; // Цена у конкурента

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  oldPrice: number; // Старая цена (если есть скидка)

  @Column({ type: 'int', nullable: true })
  rating: number; // Рейтинг товара (1-5)

  @Column({ type: 'int', nullable: true })
  reviewsCount: number; // Количество отзывов

  @Column({ type: 'int', nullable: true })
  salesCount: number; // Количество продаж (если доступно)

  @Column({ type: 'int', nullable: true })
  position: number; // Позиция в поисковой выдаче

  @Column({ nullable: true })
  category: string; // Категория товара

  @Column({ type: 'date' })
  date: Date; // Дата данных

  @Column({ type: 'json', nullable: true })
  metadata: any; // Дополнительные данные

  @CreateDateColumn()
  createdAt: Date;
}

