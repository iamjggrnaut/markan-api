import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';
import { User } from '../users/user.entity';
import { Organization } from './organization.entity';

export enum OrganizationRole {
  OWNER = 'owner',
  ADMIN = 'admin',
  MANAGER = 'manager',
  MEMBER = 'member',
  VIEWER = 'viewer',
}

@Entity('organization_members')
@Unique(['organization', 'user'])
export class OrganizationMember {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  organization: Organization;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  user: User;

  @Column({
    type: 'enum',
    enum: OrganizationRole,
    default: OrganizationRole.MEMBER,
  })
  role: OrganizationRole;

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'json', nullable: true })
  permissions: any; // Дополнительные права

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

