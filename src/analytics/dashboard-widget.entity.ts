import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../users/user.entity';
import { Organization } from '../organizations/organization.entity';

export enum WidgetType {
  REVENUE = 'revenue',
  PROFIT = 'profit',
  SALES = 'sales',
  ORDERS = 'orders',
  AVERAGE_ORDER_VALUE = 'average_order_value',
  GROWTH_RATE = 'growth_rate',
  TOP_PRODUCTS = 'top_products',
  SALES_BY_MARKETPLACE = 'sales_by_marketplace',
  SALES_CHART = 'sales_chart',
  REGIONAL_MAP = 'regional_map',
}

@Entity('dashboard_widgets')
export class DashboardWidget {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  user: User;

  @ManyToOne(() => Organization, { nullable: true, onDelete: 'CASCADE' })
  organization: Organization;

  @Column({
    type: 'enum',
    enum: WidgetType,
  })
  type: WidgetType;

  @Column()
  title: string; // Название виджета

  @Column({ type: 'int' })
  position: number; // Позиция на дашборде

  @Column({ type: 'int', default: 1 })
  width: number; // Ширина (1-4 колонки)

  @Column({ type: 'int', default: 1 })
  height: number; // Высота (в единицах)

  @Column({ type: 'json', nullable: true })
  config: any; // Конфигурация виджета

  @Column({ default: true })
  isVisible: boolean; // Видим ли виджет

  @Column({ default: 0 })
  sortOrder: number; // Порядок сортировки

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

