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
import { ReportType, ReportFormat } from './report.entity';

export enum ScheduleFrequency {
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
}

@Entity('report_schedules')
@Index(['user', 'isActive'])
export class ReportSchedule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  user: User;

  @ManyToOne(() => Organization, { nullable: true, onDelete: 'CASCADE' })
  organization: Organization;

  @Column()
  name: string; // Название расписания

  @Column({
    type: 'enum',
    enum: ReportType,
  })
  reportType: ReportType;

  @Column({
    type: 'enum',
    enum: ReportFormat,
  })
  format: ReportFormat;

  @Column({
    type: 'enum',
    enum: ScheduleFrequency,
  })
  frequency: ScheduleFrequency;

  @Column({ type: 'time', nullable: true })
  time: string; // Время отправки (HH:mm)

  @Column({ type: 'int', nullable: true })
  dayOfWeek: number; // День недели (0-6, для weekly)

  @Column({ type: 'int', nullable: true })
  dayOfMonth: number; // День месяца (1-31, для monthly)

  @Column({ type: 'json', nullable: true })
  recipients: string[]; // Email адреса получателей

  @Column({ type: 'json', nullable: true })
  parameters: any; // Параметры отчета

  @Column({ default: true })
  isActive: boolean; // Активно ли расписание

  @Column({ nullable: true })
  lastRunAt: Date; // Последний запуск

  @Column({ nullable: true })
  nextRunAt: Date; // Следующий запуск

  @Column({ type: 'json', nullable: true })
  metadata: any;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

