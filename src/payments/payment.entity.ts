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
import { PlanType } from '../plans/plan.entity';

export enum PaymentStatus {
  PENDING = 'pending', // Ожидает оплаты
  UPLOADED = 'uploaded', // Квитанция загружена, ожидает проверки
  VERIFYING = 'verifying', // Проверяется
  APPROVED = 'approved', // Подтвержден, подписка активирована
  REJECTED = 'rejected', // Отклонен
  EXPIRED = 'expired', // Истек срок ожидания
}

@Entity('payments')
@Index(['user', 'status'])
@Index(['status', 'createdAt'])
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  user: User;

  @Column({ type: 'enum', enum: PlanType })
  planType: PlanType;

  @Column()
  billingPeriod: string; // monthly, quarterly, semiAnnual, annual

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: number; // Сумма к оплате

  @Column({ default: 'RUB' })
  currency: string;

  @Column({ type: 'enum', enum: PaymentStatus, default: PaymentStatus.PENDING })
  status: PaymentStatus;

  @Column({ nullable: true })
  receiptFile: string; // Путь к файлу квитанции

  @Column({ nullable: true })
  receiptFileName: string; // Оригинальное имя файла

  @Column({ nullable: true, type: 'text' })
  adminNotes: string; // Заметки администратора

  @Column({ nullable: true })
  paymentComment: string; // Уникальный комментарий для перевода (для идентификации)

  @Column({ nullable: true })
  qrCode: string; // QR-код для СБП (base64 или URL)

  @Column({ nullable: true, default: 'sbp' })
  provider: string; // sbp, yookassa

  @Column({ nullable: true })
  externalPaymentId: string; // ID платежа в системе провайдера

  @Column({ nullable: true })
  paymentUrl: string; // URL для оплаты (для ЮКассы)

  @Column({ type: 'json', nullable: true })
  webhookData: any; // Данные от провайдера (webhook)

  @Column({ type: 'timestamp', nullable: true })
  paidAt: Date; // Дата загрузки квитанции

  @Column({ type: 'timestamp', nullable: true })
  verifiedAt: Date; // Дата подтверждения администратором

  @Column({ type: 'timestamp', nullable: true })
  expiresAt: Date; // Дата истечения срока ожидания оплаты

  @Column({ type: 'timestamp', nullable: true })
  subscriptionStartDate: Date; // Дата начала подписки

  @Column({ type: 'timestamp', nullable: true })
  subscriptionEndDate: Date; // Дата окончания подписки

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

