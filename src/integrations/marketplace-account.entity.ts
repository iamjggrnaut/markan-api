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

export enum MarketplaceType {
  WILDBERRIES = 'wildberries',
  OZON = 'ozon',
  YANDEX_MARKET = 'yandex_market',
}

export enum AccountStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  ERROR = 'error',
  SYNCING = 'syncing',
}

@Entity('marketplace_accounts')
@Index(['user', 'marketplaceType'])
@Index(['organization', 'marketplaceType'])
export class MarketplaceAccount {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  user: User;

  @ManyToOne(() => Organization, { nullable: true, onDelete: 'CASCADE' })
  organization: Organization;

  @Column({
    type: 'enum',
    enum: MarketplaceType,
  })
  marketplaceType: MarketplaceType;

  @Column()
  accountName: string; // Название аккаунта (для удобства пользователя)

  @Column({ type: 'text' })
  encryptedApiKey: string; // Зашифрованный API ключ

  @Column({ type: 'text', nullable: true })
  encryptedApiSecret: string; // Зашифрованный API секрет (если нужен)

  @Column({ type: 'text', nullable: true })
  encryptedToken: string; // Зашифрованный токен (если используется OAuth)

  @Column({ type: 'json', nullable: true })
  credentials: any; // Дополнительные зашифрованные данные

  @Column({
    type: 'enum',
    enum: AccountStatus,
    default: AccountStatus.INACTIVE,
  })
  status: AccountStatus;

  @Column({ type: 'text', nullable: true })
  lastError: string; // Последняя ошибка

  @Column({ nullable: true })
  lastSyncAt: Date; // Время последней синхронизации

  @Column({ nullable: true })
  lastSyncStatus: string; // Статус последней синхронизации

  @Column({ type: 'json', nullable: true })
  syncSettings: any; // Настройки синхронизации

  @Column({ type: 'json', nullable: true })
  metadata: any; // Дополнительные метаданные

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

