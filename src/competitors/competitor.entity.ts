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
import { Product } from '../products/product.entity';

export enum CompetitorStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  PAUSED = 'paused',
}

@Entity('competitors')
@Index(['user', 'status'])
export class Competitor {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  user: User;

  @ManyToOne(() => Organization, { nullable: true, onDelete: 'CASCADE' })
  organization: Organization;

  @Column()
  name: string; // Название конкурента

  @Column({ nullable: true })
  marketplaceType: string; // Тип маркетплейса (wildberries, ozon, etc.)

  @Column({ nullable: true })
  sellerId: string; // ID продавца на маркетплейсе

  @Column({ nullable: true })
  url: string; // URL профиля/магазина

  @Column({
    type: 'enum',
    enum: CompetitorStatus,
    default: CompetitorStatus.ACTIVE,
  })
  status: CompetitorStatus;

  @Column({ type: 'json', nullable: true })
  metadata: any; // Дополнительные данные

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

