import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('user_settings')
export class UserSettings {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn()
  user: User;

  @Column({ nullable: true })
  language: string; // ru, en

  @Column({ nullable: true })
  timezone: string;

  @Column({ default: true })
  emailNotifications: boolean;

  @Column({ default: true })
  pushNotifications: boolean;

  @Column({ default: true })
  telegramNotifications: boolean;

  @Column({ type: 'json', nullable: true })
  dashboardPreferences: any; // Настройки дашборда

  @Column({ type: 'json', nullable: true })
  reportPreferences: any; // Настройки отчетов

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

