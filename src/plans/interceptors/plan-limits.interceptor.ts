import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  ForbiddenException,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { Reflector } from '@nestjs/core';
import { PlansService } from '../plans.service';
import { PLAN_FEATURE_KEY } from '../decorators/plan-feature.decorator';

@Injectable()
export class PlanLimitsInterceptor implements NestInterceptor {
  constructor(
    private plansService: PlansService,
    private reflector: Reflector,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      return next.handle();
    }

    const requiredFeature = this.reflector.get<string>(
      PLAN_FEATURE_KEY,
      context.getHandler(),
    );

    if (requiredFeature) {
      const limits = await this.plansService.getUserPlanLimits(user.userId);

      // Проверяем доступность функции
      if (!limits[requiredFeature]) {
        throw new ForbiddenException(
          `Функция "${requiredFeature}" недоступна в вашем тарифе`,
        );
      }
    }

    return next.handle();
  }
}

