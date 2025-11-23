import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { MarketplaceAccount } from '../integrations/marketplace-account.entity';
import { ProductStock } from './product-stock.entity';
import { ProductSale } from './product-sale.entity';
import { ProductCategory } from './product-category.entity';

@Entity('products')
@Index(['marketplaceAccount', 'marketplaceProductId'])
@Index(['sku'])
@Index(['barcode'])
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => MarketplaceAccount, { onDelete: 'CASCADE' })
  marketplaceAccount: MarketplaceAccount;

  @Column()
  marketplaceProductId: string; // ID товара в маркетплейсе

  @Column({ nullable: true })
  sku: string; // Артикул продавца

  @Column({ nullable: true })
  barcode: string; // Штрихкод

  @Column()
  name: string; // Название товара

  @Column({ type: 'text', nullable: true })
  description: string; // Описание

  @ManyToOne(() => ProductCategory, { nullable: true })
  category: ProductCategory;

  @Column({ nullable: true })
  brand: string; // Бренд

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  price: number; // Текущая цена

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  costPrice: number; // Себестоимость

  @Column({ type: 'json', nullable: true })
  images: string[]; // Массив URL изображений

  @Column({ type: 'json', nullable: true })
  attributes: any; // Дополнительные атрибуты товара

  @Column({ type: 'json', nullable: true })
  metadata: any; // Метаданные товара (прогнозы, рекомендации и т.д.)

  @Column({ default: 0 })
  totalStock: number; // Общий остаток

  @Column({ default: 0 })
  reservedStock: number; // Зарезервированный остаток

  @Column({ default: 0 })
  availableStock: number; // Доступный остаток

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  totalRevenue: number; // Общая выручка

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  totalProfit: number; // Общая прибыль

  @Column({ default: 0 })
  totalSales: number; // Общее количество продаж

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  rating: number; // Рейтинг товара

  @Column({ default: 0 })
  reviewsCount: number; // Количество отзывов

  @Column({ default: true })
  isActive: boolean; // Активен ли товар

  @Column({ nullable: true })
  lastSyncAt: Date; // Время последней синхронизации

  @OneToMany(() => ProductStock, (stock) => stock.product)
  stocks: ProductStock[];

  @OneToMany(() => ProductSale, (sale) => sale.product)
  sales: ProductSale[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

