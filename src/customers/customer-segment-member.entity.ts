import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { CustomerSegment } from './customer-segment.entity';

@Entity('customer_segment_members')
@Index(['segment', 'customerId'])
export class CustomerSegmentMember {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => CustomerSegment, { onDelete: 'CASCADE' })
  segment: CustomerSegment;

  @Column()
  customerId: string; // ID клиента (orderId или другой идентификатор)

  @Column({ type: 'json', nullable: true })
  customerData: any; // Данные клиента

  @CreateDateColumn()
  createdAt: Date;
}

