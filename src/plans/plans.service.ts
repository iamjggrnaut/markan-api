import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Plan, PlanType } from './plan.entity';
import { UsersService } from '../users/users.service';
import { ActivityType } from '../users/user-activity.entity';

@Injectable()
export class PlansService {
  constructor(
    @InjectRepository(Plan)
    private plansRepository: Repository<Plan>,
    private usersService: UsersService,
  ) {}

  async findAll(): Promise<Plan[]> {
    return this.plansRepository.find({
      where: { isActive: true },
      order: { price: 'ASC' },
    });
  }

  async findOne(id: string): Promise<Plan> {
    const plan = await this.plansRepository.findOne({ where: { id } });
    if (!plan) {
      throw new NotFoundException(`Plan with ID ${id} not found`);
    }
    return plan;
  }

  async findByType(type: PlanType): Promise<Plan> {
    const plan = await this.plansRepository.findOne({ where: { type } });
    if (!plan) {
      throw new NotFoundException(`Plan with type ${type} not found`);
    }
    return plan;
  }

  async changeUserPlan(
    userId: string,
    planType: PlanType,
    billingPeriod: string = 'monthly',
  ): Promise<void> {
    const user = await this.usersService.findOne(userId);
    const plan = await this.findByType(planType);

    // Если пользователь еще не использовал trial (trialEndDate null или trial уже закончился), даем ему 1 день пробного периода
    const now = new Date();
    const hasUsedTrial = user.trialEndDate !== null && user.trialEndDate < now;
    const isInActiveTrial = user.isTrial && user.trialEndDate && user.trialEndDate > now;
    
    const nextBillingDate = this.calculateNextBillingDate(billingPeriod);

    // Если пользователь уже в активном trial, просто меняем тариф без нового trial
    if (isInActiveTrial) {
      await this.usersService.update(user.id, {
        plan: planType,
        trialPlan: planType, // Обновляем trialPlan на новый тариф
        billingPeriod: billingPeriod,
        nextBillingDate: nextBillingDate,
      } as any);
    } else if (!hasUsedTrial) {
      // Если trial еще не использован, даем 1 день пробного периода
      const trialEndDate = new Date(now.getTime() + 24 * 60 * 60 * 1000); // +1 день
      await this.usersService.update(user.id, {
        plan: planType,
        isTrial: true,
        trialStartDate: now,
        trialEndDate: trialEndDate,
        trialPlan: planType,
        billingPeriod: billingPeriod,
        nextBillingDate: nextBillingDate,
      } as any);
    } else {
      // Trial уже был использован, просто меняем тариф
      await this.usersService.update(user.id, {
        plan: planType,
        billingPeriod: billingPeriod,
        nextBillingDate: nextBillingDate,
      } as any);
    }

    // Логируем активность
    await this.usersService.logActivity(
      userId,
      ActivityType.SETTINGS_UPDATE,
      {
        action: 'plan_change',
        oldPlan: user.plan,
        newPlan: planType,
        isTrial: isInActiveTrial || (!hasUsedTrial && !isInActiveTrial),
      },
    );
  }

  async startTrial(userId: string, planType: PlanType): Promise<void> {
    const user = await this.usersService.findOne(userId);
    
    // Проверяем, не использовал ли пользователь уже trial
    if (user.trialEndDate !== null) {
      throw new Error('Пробный период уже был использован');
    }

    const now = new Date();
    const trialEndDate = new Date(now.getTime() + 24 * 60 * 60 * 1000); // +1 день
    const nextBillingDate = this.calculateNextBillingDate('monthly'); // По умолчанию месячная подписка

    await this.usersService.update(user.id, {
      plan: planType,
      isTrial: true,
      trialStartDate: now,
      trialEndDate: trialEndDate,
      trialPlan: planType,
      billingPeriod: 'monthly', // По умолчанию месячная подписка
      nextBillingDate: nextBillingDate,
    } as any);

    await this.usersService.logActivity(
      userId,
      ActivityType.SETTINGS_UPDATE,
      {
        action: 'trial_started',
        plan: planType,
        trialEndDate: trialEndDate,
      },
    );
  }

  // Проверка окончания trial периода каждый час
  @Cron(CronExpression.EVERY_HOUR)
  async checkAndEndExpiredTrials(): Promise<void> {
    const now = new Date();
    // Получаем только пользователей с активным trial
    const users = await this.usersService.findAll();
    const trialUsers = users.filter(u => u.isTrial && u.trialEndDate);
    
    for (const user of trialUsers) {
      if (user.trialEndDate && user.trialEndDate <= now) {
        // Переводим на базовый тариф после окончания trial
        await this.usersService.update(user.id, {
          plan: PlanType.BASIC,
          isTrial: false,
        } as any);

        await this.usersService.logActivity(
          user.id,
          ActivityType.SETTINGS_UPDATE,
          {
            action: 'trial_ended',
            oldPlan: user.plan,
            newPlan: PlanType.BASIC,
          },
        );
      }
    }
  }

  async getUserTrialInfo(userId: string): Promise<{
    isTrial: boolean;
    trialStartDate: Date | null;
    trialEndDate: Date | null;
    trialPlan: string | null;
    daysRemaining: number | null;
  }> {
    const user = await this.usersService.findOne(userId);
    
    if (!user.isTrial || !user.trialEndDate) {
      return {
        isTrial: false,
        trialStartDate: null,
        trialEndDate: null,
        trialPlan: null,
        daysRemaining: null,
      };
    }

    const now = new Date();
    const daysRemaining = Math.max(0, Math.ceil((user.trialEndDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)));

    return {
      isTrial: user.isTrial,
      trialStartDate: user.trialStartDate,
      trialEndDate: user.trialEndDate,
      trialPlan: user.trialPlan,
      daysRemaining,
    };
  }

  async getUserPlanLimits(userId: string): Promise<any> {
    const user = await this.usersService.findOne(userId);
    const plan = await this.findByType(user.plan as PlanType);

    return {
      maxIntegrations: plan.maxIntegrations,
      maxUsers: plan.maxUsers,
      hasAnalytics: plan.hasAnalytics,
      hasAiRecommendations: plan.hasAiRecommendations,
      hasCompetitorAnalysis: plan.hasCompetitorAnalysis,
      hasCustomReports: plan.hasCustomReports,
      maxReportsPerMonth: plan.maxReportsPerMonth,
      dataRetentionDays: plan.dataRetentionDays,
    };
  }

  async checkIntegrationLimits(
    userId: string,
    organizationId: string | null,
  ): Promise<{ allowed: boolean; currentCount: number; maxCount: number; message?: string }> {
    const user = await this.usersService.findOne(userId);
    const plan = await this.findByType(user.plan as PlanType);

    // Если maxIntegrations = -1, значит без ограничений (Enterprise план)
    if (plan.maxIntegrations === -1) {
      return {
        allowed: true,
        currentCount: 0,
        maxCount: -1,
      };
    }

    // Получаем количество текущих интеграций
    // Нужно импортировать IntegrationsService или использовать репозиторий напрямую
    // Для этого нужно добавить зависимость в PlansModule
    // Пока используем простой подход через UsersService или создадим отдельный метод
    
    // Временное решение: возвращаем базовую проверку
    // Реальная проверка будет в IntegrationsService с использованием этого метода
    
    return {
      allowed: true, // Будет переопределено в IntegrationsService
      currentCount: 0,
      maxCount: plan.maxIntegrations,
    };
  }

  private calculateBillingPeriods(basePrice: number) {
    return {
      monthly: {
        price: basePrice,
        discount: 0,
      },
      quarterly: {
        price: Math.round(basePrice * 3 * 0.9), // 10% скидка
        discount: 10,
      },
      semiAnnual: {
        price: Math.round(basePrice * 6 * 0.8), // 20% скидка
        discount: 20,
      },
      annual: {
        price: Math.round(basePrice * 12 * 0.7), // 30% скидка
        discount: 30,
      },
    };
  }

  async seedPlans(): Promise<void> {
    const plans = [
      {
        type: PlanType.BASIC,
        name: 'Базовый',
        description: 'Для небольших продавцов',
        price: 1990,
        currency: 'RUB',
        billingPeriods: this.calculateBillingPeriods(1990),
        maxIntegrations: 3,
        maxUsers: 3,
        hasAnalytics: true,
        hasAiRecommendations: true,
        hasCompetitorAnalysis: false,
        hasCustomReports: true,
        maxReportsPerMonth: 50,
        dataRetentionDays: 90,
        features: {
          dashboard: true,
          basicAnalytics: true,
          advancedAnalytics: true,
          products: true,
          stockMonitoring: true,
          aiRecommendations: true,
          customReports: true,
        },
      },
      {
        type: PlanType.PREMIUM,
        name: 'Премиум',
        description: 'Для растущего бизнеса',
        price: 4990,
        currency: 'RUB',
        billingPeriods: this.calculateBillingPeriods(4990),
        maxIntegrations: 10,
        maxUsers: 10,
        hasAnalytics: true,
        hasAiRecommendations: true,
        hasCompetitorAnalysis: true,
        hasCustomReports: true,
        maxReportsPerMonth: 200,
        dataRetentionDays: 365,
        features: {
          dashboard: true,
          basicAnalytics: true,
          advancedAnalytics: true,
          products: true,
          stockMonitoring: true,
          aiRecommendations: true,
          competitorAnalysis: true,
          customReports: true,
          geographyAnalytics: true,
          apiAccess: true,
        },
      },
      {
        type: PlanType.ENTERPRISE,
        name: 'Корпоративный',
        description: 'Для крупных компаний и агентств',
        price: 19990,
        currency: 'RUB',
        billingPeriods: this.calculateBillingPeriods(19990),
        maxIntegrations: -1, // Без ограничений
        maxUsers: -1, // Без ограничений
        hasAnalytics: true,
        hasAiRecommendations: true,
        hasCompetitorAnalysis: true,
        hasCustomReports: true,
        maxReportsPerMonth: -1, // Без ограничений
        dataRetentionDays: -1, // Без ограничений
        features: {
          dashboard: true,
          basicAnalytics: true,
          advancedAnalytics: true,
          products: true,
          stockMonitoring: true,
          aiRecommendations: true,
          competitorAnalysis: true,
          customReports: true,
          geographyAnalytics: true,
          apiAccess: true,
          prioritySupport: true,
          customIntegrations: true,
          whiteLabel: true,
        },
      },
    ];

    for (const planData of plans) {
      const existingPlan = await this.plansRepository.findOne({
        where: { type: planData.type },
      });

      if (!existingPlan) {
        const plan = this.plansRepository.create(planData);
        await this.plansRepository.save(plan);
      } else {
        // Обновляем существующий план с новыми периодами
        existingPlan.billingPeriods = planData.billingPeriods;
        existingPlan.price = planData.price;
        await this.plansRepository.save(existingPlan);
      }
    }
  }

  async getPlansWithPeriods() {
    const plans = await this.findAll();
    return plans.map((plan) => ({
      ...plan,
      billingPeriods: plan.billingPeriods || this.calculateBillingPeriods(Number(plan.price)),
    }));
  }

  calculateNextBillingDate(billingPeriod: string): Date {
    const now = new Date();
    const nextDate = new Date(now);

    switch (billingPeriod) {
      case 'monthly':
        nextDate.setMonth(nextDate.getMonth() + 1);
        break;
      case 'quarterly':
        nextDate.setMonth(nextDate.getMonth() + 3);
        break;
      case 'semiAnnual':
        nextDate.setMonth(nextDate.getMonth() + 6);
        break;
      case 'annual':
        nextDate.setFullYear(nextDate.getFullYear() + 1);
        break;
      default:
        nextDate.setMonth(nextDate.getMonth() + 1);
    }

    return nextDate;
  }
}

