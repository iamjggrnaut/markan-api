import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { OrganizationsService } from '../organizations.service';
import { OrganizationRole } from '../organization-member.entity';

export const REQUIRED_ROLE_KEY = 'requiredRole';
export const RequiredRole = (role: OrganizationRole) => {
  return (target: any, propertyKey?: string, descriptor?: PropertyDescriptor) => {
    Reflector.prototype.get(REQUIRED_ROLE_KEY, descriptor?.value || target);
  };
};

@Injectable()
export class OrganizationMemberGuard implements CanActivate {
  constructor(
    private organizationsService: OrganizationsService,
    private reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const organizationId = request.params.id || request.params.organizationId;

    if (!user || !organizationId) {
      throw new ForbiddenException('Access denied');
    }

    const requiredRole = this.reflector.get<OrganizationRole>(
      REQUIRED_ROLE_KEY,
      context.getHandler(),
    );

    const hasAccess = await this.organizationsService.checkPermission(
      organizationId,
      user.userId,
      requiredRole,
    );

    if (!hasAccess) {
      throw new ForbiddenException('Insufficient permissions');
    }

    return true;
  }
}

