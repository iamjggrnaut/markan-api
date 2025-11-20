import * as Sentry from '@sentry/node';
import { ConfigService } from '@nestjs/config';

export const initializeSentry = (configService: ConfigService): void => {
  const dsn = configService.get<string>('SENTRY_DSN');
  const environment = configService.get<string>('NODE_ENV') || 'development';

  if (!dsn) {
    console.warn('Sentry DSN not configured. Error tracking disabled.');
    return;
  }

  Sentry.init({
    dsn,
    environment,
    tracesSampleRate: environment === 'production' ? 0.1 : 1.0, // 10% в production, 100% в dev
    profilesSampleRate: environment === 'production' ? 0.1 : 1.0,
    integrations: [
      // HTTP интеграция включена по умолчанию в новых версиях Sentry
      // Если нужна кастомная настройка, используйте httpIntegration()
    ],
    // Игнорируем некоторые ошибки
    ignoreErrors: [
      'UnauthorizedException',
      'ForbiddenException',
      'NotFoundException',
      'BadRequestException',
    ],
    // Фильтруем чувствительные данные
    beforeSend(event, hint) {
      // Удаляем чувствительные данные из контекста
      if (event.request) {
        delete event.request.cookies;
        if (event.request.headers) {
          delete event.request.headers.authorization;
          delete event.request.headers.cookie;
        }
      }
      return event;
    },
  });
};

