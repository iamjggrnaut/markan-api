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

export enum ReportType {
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
  CUSTOM = 'custom',
}

export enum ReportFormat {
  EXCEL = 'excel',
  PDF = 'pdf',
  CSV = 'csv',
  JSON = 'json',
}

export enum ReportStatus {
  PENDING = 'pending',
  GENERATING = 'generating',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

@Entity('reports')
@Index(['user', 'type', 'createdAt'])
export class Report {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  user: User;

  @ManyToOne(() => Organization, { nullable: true, onDelete: 'CASCADE' })
  organization: Organization;

  @Column({
    type: 'enum',
    enum: ReportType,
  })
  type: ReportType;

  @Column({
    type: 'enum',
    enum: ReportFormat,
  })
  format: ReportFormat;

  @Column()
  title: string; // Название отчета

  @Column({ type: 'text', nullable: true })
  description: string; // Описание отчета

  @Column({
    type: 'enum',
    enum: ReportStatus,
    default: ReportStatus.PENDING,
  })
  status: ReportStatus;

  @Column({ nullable: true })
  filePath: string; // Путь к файлу отчета

  @Column({ nullable: true })
  fileName: string; // Имя файла

  @Column({ type: 'bigint', nullable: true })
  fileSize: number; // Размер файла в байтах

  @Column({ type: 'json', nullable: true })
  parameters: any; // Параметры отчета (даты, фильтры и т.д.)

  @Column({ type: 'json', nullable: true })
  data: any; // Данные отчета

  @Column({ type: 'text', nullable: true })
  error: string; // Ошибка при генерации

  @Column({ nullable: true })
  generatedAt: Date; // Дата генерации

  @Column({ default: false })
  isScheduled: boolean; // Автоматически сгенерирован

  @Column({ type: 'json', nullable: true })
  metadata: any;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

