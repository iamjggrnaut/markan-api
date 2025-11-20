import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    // Проверяем роль пользователя (из JWT токена или из БД)
    const userRole = user.role || 'user';
    if (userRole !== 'admin') {
      throw new ForbiddenException('Admin access required');
    }

    return true;
  }
}

