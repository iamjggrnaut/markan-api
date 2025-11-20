import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../users/user.entity';

export enum PlanType {
  BASIC = 'basic',
  PREMIUM = 'premium',
  ENTERPRISE = 'enterprise',
}

@Entity('plans')
export class Plan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, type: 'enum', enum: PlanType })
  type: PlanType;

  @Column()
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  price: number; // Базовая цена за месяц

  @Column({ default: 'RUB' })
  currency: string;

  @Column({ type: 'json', nullable: true })
  billingPeriods: {
    monthly: { price: number; discount: number }; // 1 месяц
    quarterly: { price: number; discount: number }; // 3 месяца
    semiAnnual: { price: number; discount: number }; // 6 месяцев
    annual: { price: number; discount: number }; // 12 месяцев
  };

  @Column({ type: 'json', nullable: true })
  features: any; // Лимиты и возможности тарифа

  @Column({ default: true })
  isActive: boolean;

  @Column({ default: 0 })
  maxIntegrations: number; // Максимум интеграций с маркетплейсами

  @Column({ default: 0 })
  maxUsers: number; // Максимум пользователей в организации

  @Column({ default: false })
  hasAnalytics: boolean;

  @Column({ default: false })
  hasAiRecommendations: boolean;

  @Column({ default: false })
  hasCompetitorAnalysis: boolean;

  @Column({ default: false })
  hasCustomReports: boolean;

  @Column({ default: 0 })
  maxReportsPerMonth: number;

  @Column({ default: 0 })
  dataRetentionDays: number; // Хранение данных в днях

  @OneToMany(() => User, (user) => user.plan)
  users: User[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

