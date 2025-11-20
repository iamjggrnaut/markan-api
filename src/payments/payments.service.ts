import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Payment, PaymentStatus } from './payment.entity';
import { User } from '../users/user.entity';
import { PlansService } from '../plans/plans.service';
import { PlanType } from '../plans/plan.entity';
import * as fs from 'fs';
import * as path from 'path';
import { ConfigService } from '@nestjs/config';
import { PaymentProviderFactory } from './providers/payment-provider.factory';

@Injectable()
export class PaymentsService {
  private readonly receiptsDir: string;

  constructor(
    @InjectRepository(Payment)
    private paymentsRepository: Repository<Payment>,
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    private plansService: PlansService,
    private configService: ConfigService,
    private providerFactory: PaymentProviderFactory,
  ) {
    // Создаем директорию для квитанций
    this.receiptsDir = path.join(process.cwd(), 'uploads', 'receipts');
    if (!fs.existsSync(this.receiptsDir)) {
      fs.mkdirSync(this.receiptsDir, { recursive: true });
    }
  }

  /**
   * Создать новый платеж
   */
  async createPayment(
    userId: string,
    planType: PlanType,
    billingPeriod: string,
    providerName?: string,
  ): Promise<Payment> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Пользователь не найден');
    }

    const plan = await this.plansService.findByType(planType);
    if (!plan) {
      throw new NotFoundException('Тарифный план не найден');
    }

    // Вычисляем сумму к оплате
    const billingPeriods = plan.billingPeriods || {};
    const periodData = billingPeriods[billingPeriod as keyof typeof billingPeriods] as { price: number; discount: number } | undefined;
    
    if (!periodData) {
      throw new BadRequestException('Неверный период подписки');
    }

    const amount = periodData.price;

    // Получаем провайдер
    const provider = providerName
      ? this.providerFactory.getProviderByName(providerName)
      : this.providerFactory.getProvider();

    // Создаем платеж через провайдер
    const providerResult = await provider.createPayment({
      userId,
      planType,
      billingPeriod,
      amount,
      currency: 'RUB',
    });

    // Вычисляем дату истечения (24 часа для СБП, 30 минут для ЮКассы)
    const expiresAt = new Date();
    if (provider.getName() === 'sbp') {
      expiresAt.setHours(expiresAt.getHours() + 24);
    } else {
      expiresAt.setMinutes(expiresAt.getMinutes() + 30);
    }

    // Создаем платеж
    const payment = this.paymentsRepository.create({
      user,
      planType,
      billingPeriod,
      amount,
      currency: 'RUB',
      status: PaymentStatus.PENDING,
      provider: provider.getName(),
      externalPaymentId: providerResult.externalPaymentId,
      paymentUrl: providerResult.paymentUrl,
      paymentComment: providerResult.paymentComment,
      qrCode: providerResult.qrCode,
      expiresAt,
    });

    return await this.paymentsRepository.save(payment);
  }

  /**
   * Загрузить квитанцию об оплате
   */
  async uploadReceipt(
    paymentId: string,
    userId: string,
    file: Express.Multer.File,
  ): Promise<Payment> {
    const payment = await this.paymentsRepository.findOne({
      where: { id: paymentId },
      relations: ['user'],
    });

    if (!payment || payment.user.id !== userId) {
      throw new NotFoundException('Платеж не найден');
    }

    if (payment.status !== PaymentStatus.PENDING) {
      throw new BadRequestException('Платеж уже обработан');
    }

    // Сохраняем файл
    const fileExtension = path.extname(file.originalname);
    const fileName = `receipt_${paymentId}_${Date.now()}${fileExtension}`;
    const filePath = path.join(this.receiptsDir, fileName);

    fs.writeFileSync(filePath, file.buffer);

    // Обновляем платеж
    payment.receiptFile = `receipts/${fileName}`;
    payment.receiptFileName = file.originalname;
    payment.status = PaymentStatus.UPLOADED;
    payment.paidAt = new Date();

    return await this.paymentsRepository.save(payment);
  }

  /**
   * Получить платежи пользователя
   */
  async getUserPayments(userId: string): Promise<Payment[]> {
    return await this.paymentsRepository
      .createQueryBuilder('payment')
      .leftJoinAndSelect('payment.user', 'user')
      .where('user.id = :userId', { userId })
      .orderBy('payment.createdAt', 'DESC')
      .getMany();
  }

  /**
   * Получить платеж по ID
   */
  async getPaymentById(paymentId: string, userId?: string): Promise<Payment> {
    const queryBuilder = this.paymentsRepository
      .createQueryBuilder('payment')
      .leftJoinAndSelect('payment.user', 'user')
      .where('payment.id = :paymentId', { paymentId });

    if (userId) {
      queryBuilder.andWhere('user.id = :userId', { userId });
    }

    const payment = await queryBuilder.getOne();

    if (!payment) {
      throw new NotFoundException('Платеж не найден');
    }

    return payment;
  }

  /**
   * Подтвердить платеж (админ)
   */
  async approvePayment(
    paymentId: string,
    adminNotes?: string,
  ): Promise<Payment> {
    const payment = await this.paymentsRepository.findOne({
      where: { id: paymentId },
      relations: ['user'],
    });

    if (!payment) {
      throw new NotFoundException('Платеж не найден');
    }

    if (payment.status === PaymentStatus.APPROVED) {
      throw new BadRequestException('Платеж уже подтвержден');
    }

    // Для ЮКассы проверяем статус через провайдер
    if (payment.provider === 'yookassa' && payment.externalPaymentId) {
      const provider = this.providerFactory.getProviderByName('yookassa');
      const verification = await provider.verifyPayment({
        paymentId: payment.id,
        externalPaymentId: payment.externalPaymentId,
      });

      if (!verification.isVerified && verification.status !== 'succeeded') {
        throw new BadRequestException('Платеж не подтвержден в системе провайдера');
      }
    }

    // Активируем подписку
    await this.plansService.changeUserPlan(
      payment.user.id,
      payment.planType,
      payment.billingPeriod,
    );

    // Обновляем статус платежа
    payment.status = PaymentStatus.APPROVED;
    payment.verifiedAt = new Date();
    payment.adminNotes = adminNotes || null;

    // Вычисляем даты подписки
    const now = new Date();
    payment.subscriptionStartDate = now;

    const months = this.getMonthsForPeriod(payment.billingPeriod);
    payment.subscriptionEndDate = new Date(now);
    payment.subscriptionEndDate.setMonth(payment.subscriptionEndDate.getMonth() + months);

    return await this.paymentsRepository.save(payment);
  }

  /**
   * Отклонить платеж (админ)
   */
  async rejectPayment(
    paymentId: string,
    adminNotes: string,
  ): Promise<Payment> {
    const payment = await this.paymentsRepository.findOne({
      where: { id: paymentId },
    });

    if (!payment) {
      throw new NotFoundException('Платеж не найден');
    }

    payment.status = PaymentStatus.REJECTED;
    payment.adminNotes = adminNotes;

    return await this.paymentsRepository.save(payment);
  }

  /**
   * Обработать webhook от провайдера
   */
  async processWebhook(
    providerName: string,
    webhookData: any,
  ): Promise<Payment | null> {
    const provider = this.providerFactory.getProviderByName(providerName);

    if (!provider.processWebhook) {
      throw new BadRequestException('Провайдер не поддерживает webhook');
    }

    const verification = await provider.processWebhook(webhookData);

    // Ищем платеж по externalPaymentId
    const externalPaymentId = webhookData.object?.id;
    if (!externalPaymentId) {
      return null;
    }

    const payment = await this.paymentsRepository.findOne({
      where: { externalPaymentId, provider: providerName },
      relations: ['user'],
    });

    if (!payment) {
      return null;
    }

    // Сохраняем данные webhook
    payment.webhookData = webhookData;

    // Если платеж успешен, автоматически активируем подписку
    if (verification.status === 'succeeded' && verification.isVerified) {
      if (payment.status !== PaymentStatus.APPROVED) {
        return await this.approvePayment(payment.id);
      }
    } else if (verification.status === 'canceled') {
      payment.status = PaymentStatus.REJECTED;
      payment.adminNotes = 'Платеж отменен через webhook';
      return await this.paymentsRepository.save(payment);
    }

    return payment;
  }

  /**
   * Получить все платежи для админа
   */
  async getAllPayments(
    status?: PaymentStatus,
    limit?: number,
    offset?: number,
  ): Promise<{ payments: Payment[]; total: number }> {
    const queryBuilder = this.paymentsRepository
      .createQueryBuilder('payment')
      .leftJoinAndSelect('payment.user', 'user')
      .orderBy('payment.createdAt', 'DESC');

    if (status) {
      queryBuilder.where('payment.status = :status', { status });
    }

    const total = await queryBuilder.getCount();

    if (limit) {
      queryBuilder.limit(limit);
    }
    if (offset) {
      queryBuilder.offset(offset);
    }

    const payments = await queryBuilder.getMany();

    return { payments, total };
  }

  /**
   * Проверить истечение сроков ожидания платежей
   * Запускается каждый час
   */
  @Cron(CronExpression.EVERY_HOUR)
  async checkExpiredPayments(): Promise<void> {
    const now = new Date();
    const expiredPayments = await this.paymentsRepository.find({
      where: {
        status: PaymentStatus.PENDING,
      },
    });

    for (const payment of expiredPayments) {
      if (payment.expiresAt && payment.expiresAt < now) {
        payment.status = PaymentStatus.EXPIRED;
        await this.paymentsRepository.save(payment);
      }
    }
  }

  /**
   * Получить количество месяцев для периода
   */
  private getMonthsForPeriod(period: string): number {
    const periodMap: Record<string, number> = {
      monthly: 1,
      quarterly: 3,
      semiAnnual: 6,
      annual: 12,
    };
    return periodMap[period] || 1;
  }

  /**
   * Получить файл квитанции
   */
  getReceiptFilePath(payment: Payment): string | null {
    if (!payment.receiptFile) {
      return null;
    }
    return path.join(process.cwd(), 'uploads', payment.receiptFile);
  }
}

