import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';

export enum ActivityType {
  LOGIN = 'login',
  LOGOUT = 'logout',
  PROFILE_UPDATE = 'profile_update',
  PASSWORD_CHANGE = 'password_change',
  AVATAR_UPLOAD = 'avatar_upload',
  SETTINGS_UPDATE = 'settings_update',
  INTEGRATION_ADDED = 'integration_added',
  INTEGRATION_REMOVED = 'integration_removed',
  REPORT_GENERATED = 'report_generated',
}

@Entity('user_activities')
@Index(['user', 'createdAt'])
export class UserActivity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  user: User;

  @Column({
    type: 'enum',
    enum: ActivityType,
  })
  type: ActivityType;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'json', nullable: true })
  metadata: any; // Дополнительные данные

  @Column({ nullable: true })
  ipAddress: string;

  @Column({ nullable: true })
  userAgent: string;

  @CreateDateColumn()
  createdAt: Date;
}

