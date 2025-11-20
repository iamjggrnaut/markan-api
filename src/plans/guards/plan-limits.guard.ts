import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { PlansService } from '../plans.service';
import { Reflector } from '@nestjs/core';

export const PLAN_FEATURE_KEY = 'planFeature';
export const PlanFeature = (feature: string) => {
  return (target: any, propertyKey?: string, descriptor?: PropertyDescriptor) => {
    Reflector.prototype.get(PLAN_FEATURE_KEY, descriptor?.value || target);
  };
};

@Injectable()
export class PlanLimitsGuard implements CanActivate {
  constructor(
    private plansService: PlansService,
    private reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      return true; // Если нет пользователя, пропускаем (должен быть JwtAuthGuard)
    }

    const limits = await this.plansService.getUserPlanLimits(user.userId);

    // Проверяем лимиты интеграций
    // TODO: Реализовать проверку количества интеграций
    // const integrationsCount = await this.getUserIntegrationsCount(user.userId);
    // if (limits.maxIntegrations > 0 && integrationsCount >= limits.maxIntegrations) {
    //   throw new ForbiddenException('Достигнут лимит интеграций для вашего тарифа');
    // }

    return true;
  }
}

