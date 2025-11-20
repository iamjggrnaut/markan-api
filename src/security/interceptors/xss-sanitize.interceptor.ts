import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { SecurityService } from '../security.service';

@Injectable()
export class XssSanitizeInterceptor implements NestInterceptor {
  constructor(private securityService: SecurityService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map((data) => {
        // Рекурсивно санитизируем строки в ответе
        return this.sanitizeObject(data);
      }),
    );
  }

  private sanitizeObject(obj: any): any {
    if (typeof obj === 'string') {
      return this.securityService.sanitizeText(obj);
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.sanitizeObject(item));
    }

    if (obj && typeof obj === 'object') {
      const sanitized: any = {};
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          // Пропускаем системные поля
          if (key === 'password' || key === 'encryptedApiKey') {
            continue;
          }
          sanitized[key] = this.sanitizeObject(obj[key]);
        }
      }
      return sanitized;
    }

    return obj;
  }
}

