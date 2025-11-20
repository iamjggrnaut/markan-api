import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { Product } from './product.entity';
import { MarketplaceAccount } from '../integrations/marketplace-account.entity';

@Entity('product_sales')
@Index(['product', 'saleDate'])
@Index(['marketplaceAccount', 'saleDate'])
@Index(['saleDate']) // Для фильтрации по дате
@Index(['orderId']) // Для поиска по заказу
@Index(['region', 'saleDate']) // Для гео-аналитики
export class ProductSale {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  product: Product;

  @ManyToOne(() => MarketplaceAccount, { onDelete: 'CASCADE' })
  marketplaceAccount: MarketplaceAccount;

  @Column()
  saleDate: Date; // Дата продажи

  @Column({ default: 1 })
  quantity: number; // Количество проданных единиц

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  price: number; // Цена продажи

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  totalAmount: number; // Общая сумма продажи

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  costPrice: number; // Себестоимость

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  profit: number; // Прибыль

  @Column({ nullable: true })
  orderId: string; // ID заказа в маркетплейсе

  @Column({ nullable: true })
  region: string; // Регион продажи

  @Column({ type: 'json', nullable: true })
  metadata: any; // Дополнительные данные

  @CreateDateColumn()
  createdAt: Date;
}

