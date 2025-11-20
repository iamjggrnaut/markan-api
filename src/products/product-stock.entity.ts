import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { Product } from './product.entity';
import { MarketplaceAccount } from '../integrations/marketplace-account.entity';

@Entity('product_stocks')
@Index(['product', 'warehouseId'])
export class ProductStock {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  product: Product;

  @ManyToOne(() => MarketplaceAccount, { nullable: true, onDelete: 'CASCADE' })
  marketplaceAccount: MarketplaceAccount;

  @Column({ nullable: true })
  warehouseId: string; // ID склада в маркетплейсе

  @Column({ nullable: true })
  warehouseName: string; // Название склада

  @Column({ default: 0 })
  quantity: number; // Количество на складе

  @Column({ default: 0 })
  reservedQuantity: number; // Зарезервированное количество

  @Column({ default: 0 })
  availableQuantity: number; // Доступное количество

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  forecastDepletionDays: number; // Прогноз дней до исчерпания

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  turnoverRate: number; // Оборачиваемость запасов

  @Column({ type: 'json', nullable: true })
  history: any[]; // История изменений остатков

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

