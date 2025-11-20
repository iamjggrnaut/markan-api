import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Product } from './product.entity';
import { User } from '../users/user.entity';
import { Organization } from '../organizations/organization.entity';

@Entity('product_categories')
export class ProductCategory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'CASCADE' })
  user: User;

  @ManyToOne(() => Organization, { nullable: true, onDelete: 'CASCADE' })
  organization: Organization;

  @ManyToOne(() => ProductCategory, { nullable: true, onDelete: 'CASCADE' })
  parent: ProductCategory;

  @OneToMany(() => ProductCategory, (category) => category.parent)
  children: ProductCategory[];

  @Column()
  name: string; // Название категории

  @Column({ type: 'text', nullable: true })
  description: string; // Описание категории

  @Column({ nullable: true })
  icon: string; // Иконка категории

  @Column({ default: 0 })
  sortOrder: number; // Порядок сортировки

  @Column({ default: true })
  isActive: boolean;

  @OneToMany(() => Product, (product) => product.category)
  products: Product[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

