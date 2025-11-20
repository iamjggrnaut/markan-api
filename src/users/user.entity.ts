import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  OneToMany,
  Index,
} from 'typeorm';
import { UserSettings } from './user-settings.entity';
import { UserActivity } from './user-activity.entity';

@Entity('users')
@Index(['email']) // Уже есть unique, но индекс явно указан для оптимизации
@Index(['plan', 'isActive']) // Для фильтрации по тарифу
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column()
  password: string;

  @Column({ nullable: true })
  firstName: string;

  @Column({ nullable: true })
  lastName: string;

  @Column({ nullable: true })
  avatar: string;

  @Column({ default: 'basic' })
  plan: string; // basic, premium, enterprise

  @Column({ default: 'user' })
  role: string; // user, admin

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'boolean', default: false })
  isTrial: boolean; // Находится ли пользователь в пробном периоде

  @Column({ type: 'timestamp', nullable: true })
  trialStartDate: Date; // Дата начала пробного периода

  @Column({ type: 'timestamp', nullable: true })
  trialEndDate: Date; // Дата окончания пробного периода

  @Column({ nullable: true })
  trialPlan: string; // Какой тариф был в пробном периоде

  @Column({ nullable: true, default: 'monthly' })
  billingPeriod: string; // monthly, quarterly, semiAnnual, annual

  @Column({ type: 'timestamp', nullable: true })
  nextBillingDate: Date; // Дата следующего списания

  @Column({ nullable: true })
  passwordResetToken: string;

  @Column({ nullable: true })
  passwordResetExpires: Date;

  @OneToOne(() => UserSettings, (settings) => settings.user, { cascade: true })
  settings: UserSettings;

  @OneToMany(() => UserActivity, (activity) => activity.user)
  activities: UserActivity[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

