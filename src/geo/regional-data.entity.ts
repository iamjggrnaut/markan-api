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
import { MarketplaceAccount } from '../integrations/marketplace-account.entity';

@Entity('regional_data')
@Index(['user', 'region', 'date'])
@Index(['organization', 'region', 'date'])
export class RegionalData {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  user: User;

  @ManyToOne(() => Organization, { nullable: true, onDelete: 'CASCADE' })
  organization: Organization;

  @ManyToOne(() => MarketplaceAccount, { nullable: true, onDelete: 'CASCADE' })
  marketplaceAccount: MarketplaceAccount;

  @Column()
  region: string; // Название региона

  @Column({ nullable: true })
  regionCode: string; // Код региона (например, для карты)

  @Column({ type: 'date' })
  date: Date; // Дата данных

  @Column({ default: 0 })
  ordersCount: number; // Количество заказов

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  totalRevenue: number; // Общая выручка

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  totalProfit: number; // Общая прибыль

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  averageOrderValue: number; // Средний чек

  @Column({ default: 0 })
  productsSold: number; // Количество проданных товаров

  @Column({ type: 'json', nullable: true })
  topProducts: any[]; // Топ товаров в регионе

  @Column({ type: 'json', nullable: true })
  metadata: any; // Дополнительные данные

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

