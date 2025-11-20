import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { Product } from './product.entity';

@Entity('stock_history')
@Index(['product', 'createdAt'])
export class StockHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  product: Product;

  @Column({ type: 'int' })
  previousQuantity: number; // Предыдущее количество

  @Column({ type: 'int' })
  newQuantity: number; // Новое количество

  @Column({ type: 'int' })
  difference: number; // Разница

  @Column({ nullable: true })
  reason: string; // Причина изменения (sync, sale, manual, etc.)

  @Column({ type: 'json', nullable: true })
  metadata: any; // Дополнительные данные

  @CreateDateColumn()
  createdAt: Date;
}

