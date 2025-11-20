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

export enum SegmentType {
  RFM = 'rfm', // Recency, Frequency, Monetary
  BEHAVIORAL = 'behavioral',
  DEMOGRAPHIC = 'demographic',
  CUSTOM = 'custom',
}

@Entity('customer_segments')
@Index(['user', 'name'])
export class CustomerSegment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  user: User;

  @ManyToOne(() => Organization, { nullable: true, onDelete: 'CASCADE' })
  organization: Organization;

  @Column()
  name: string; // Название сегмента

  @Column({
    type: 'enum',
    enum: SegmentType,
  })
  type: SegmentType;

  @Column({ type: 'text', nullable: true })
  description: string; // Описание сегмента

  @Column({ type: 'json' })
  criteria: any; // Критерии сегментации (RFM, поведенческие и т.д.)

  @Column({ type: 'int', default: 0 })
  customerCount: number; // Количество клиентов в сегменте

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  totalRevenue: number; // Общая выручка сегмента

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  averageLTV: number; // Средний LTV

  @Column({ type: 'json', nullable: true })
  metadata: any;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

