import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiKeysService } from '../api-keys.service';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private apiKeysService: ApiKeysService,
    private reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const apiKey = this.extractApiKeyFromHeader(request);

    if (!apiKey) {
      throw new UnauthorizedException('API key is required');
    }

    try {
      const keyData = await this.apiKeysService.validateKey(apiKey);
      request.user = {
        userId: keyData.user.id,
        organizationId: keyData.organization?.id || null,
        apiKey: keyData,
      };

      // Проверяем разрешения (scopes)
      const requiredPermissions = this.reflector.get<string[]>(
        'permissions',
        context.getHandler(),
      );

      if (requiredPermissions && keyData.permissions) {
        const hasPermission = requiredPermissions.some((perm) =>
          keyData.permissions.includes(perm),
        );
        if (!hasPermission) {
          throw new UnauthorizedException('Insufficient permissions');
        }
      }

      return true;
    } catch (error) {
      throw new UnauthorizedException('Invalid API key');
    }
  }

  private extractApiKeyFromHeader(request: any): string | null {
    const authHeader = request.headers['x-api-key'] || request.headers['authorization'];
    if (!authHeader) {
      return null;
    }

    // Поддерживаем формат "Bearer <key>" или просто "<key>"
    if (authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    if (authHeader.startsWith('ApiKey ')) {
      return authHeader.substring(7);
    }

    return authHeader;
  }
}

