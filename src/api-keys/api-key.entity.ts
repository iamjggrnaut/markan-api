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

@Entity('api_keys')
@Index(['key'], { unique: true })
export class ApiKey {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  user: User;

  @ManyToOne(() => Organization, { nullable: true, onDelete: 'CASCADE' })
  organization: Organization;

  @Column({ unique: true })
  key: string; // Хешированный ключ

  @Column()
  name: string; // Название ключа для идентификации

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'json', nullable: true })
  permissions: string[]; // Список разрешений (scopes)

  @Column({ type: 'timestamp', nullable: true })
  expiresAt: Date; // Дата истечения

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'timestamp', nullable: true })
  lastUsedAt: Date;

  @Column({ type: 'int', default: 0 })
  usageCount: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

