import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { join } from 'path';
import * as helmet from 'helmet';
import * as cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { PlansService } from './plans/plans.service';
import { ConfigService } from '@nestjs/config';
import { initializeSentry } from './config/sentry.config';
import { SentryExceptionFilter } from './filters/sentry-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  
  // Инициализируем Sentry ДО всего остального
  const configService = app.get(ConfigService);
  initializeSentry(configService);

  // Инициализация тарифных планов
  const plansService = app.get(PlansService);
  await plansService.seedPlans();

  // Безопасность: Helmet для защиты от XSS и других атак
  app.use(helmet.default({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
      },
    },
    crossOriginEmbedderPolicy: false, // Для Swagger
  }));

  // Cookie parser для CSRF токенов
  app.use(cookieParser.default());

  // Статическая раздача файлов
  app.useStaticAssets(join(__dirname, '..', 'uploads'), {
    prefix: '/uploads',
  });

  // Глобальная валидация с защитой от SQL injection
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Удаляет неразрешенные свойства
      forbidNonWhitelisted: true, // Выбрасывает ошибку при неразрешенных свойствах
      transform: true, // Автоматическая трансформация типов
      transformOptions: {
        enableImplicitConversion: true,
      },
      disableErrorMessages: process.env.NODE_ENV === 'production', // Скрываем детали ошибок в production
    }),
  );

  // CORS (безопасная настройка)
  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
    exposedHeaders: ['X-Total-Count'],
  });

  // Swagger документация
  const config = new DocumentBuilder()
    .setTitle('Nebula Markan API')
    .setDescription(
      `API для аналитического сервиса маркетплейсов.
      
## Аутентификация

API поддерживает два способа аутентификации:

1. **JWT Bearer Token** - для веб и мобильных приложений
   - Получите токен через \`POST /auth/login\`
   - Используйте в заголовке: \`Authorization: Bearer <token>\`

2. **API Key** - для внешних интеграций
   - Создайте ключ в разделе "API Keys"
   - Используйте в заголовке: \`X-API-Key: <your-key>\`

## Версионирование

API использует версионирование через URL: \`/api/v1/\`

## Rate Limiting

- Короткие запросы: 3 запроса в секунду
- Средние запросы: 20 запросов в 10 секунд
- Длинные запросы: 100 запросов в минуту

## Коды ответов

- \`200\` - Успешный запрос
- \`201\` - Ресурс создан
- \`400\` - Неверный запрос
- \`401\` - Не авторизован
- \`403\` - Доступ запрещен
- \`404\` - Ресурс не найден
- \`429\` - Превышен лимит запросов
- \`500\` - Внутренняя ошибка сервера

## Поддержка

- Email: support@nebula-markan.com
- Документация: https://docs.nebula-markan.com
      `,
    )
    .setVersion('1.0')
    .setContact('Nebula Markan Support', 'https://nebula-markan.com', 'support@nebula-markan.com')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'JWT токен для аутентификации',
      },
      'JWT-auth',
    )
    .addApiKey(
      { type: 'apiKey', in: 'header', name: 'X-API-Key', description: 'API ключ для внешних интеграций' },
      'api-key',
    )
    .addTag('Auth', 'Аутентификация и авторизация')
    .addTag('Users', 'Управление пользователями')
    .addTag('Products', 'Управление товарами')
    .addTag('Analytics', 'Аналитика и метрики')
    .addTag('Integrations', 'Интеграции с маркетплейсами')
    .addTag('AI', 'AI рекомендации и прогнозы')
    .addTag('Reports', 'Отчеты')
    .addTag('Notifications', 'Уведомления')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true, // Сохранять авторизацию при обновлении
      tagsSorter: 'alpha', // Сортировка тегов по алфавиту
      operationsSorter: 'alpha', // Сортировка операций по алфавиту
    },
    customSiteTitle: 'Nebula Markan API Documentation',
    customCss: '.swagger-ui .topbar { display: none }', // Скрыть топбар Swagger
  });

  // Версионирование API
  app.setGlobalPrefix('api/v1');

  // Используем Winston logger вместо console
  const logger = app.get(WINSTON_MODULE_NEST_PROVIDER);
  app.useLogger(logger);

  // Глобальный exception filter для Sentry
  app.useGlobalFilters(new SentryExceptionFilter());

  const port = process.env.PORT || 3001;
  await app.listen(port);
  logger.log(`Application is running on: http://localhost:${port}`, 'Bootstrap');
  logger.log(`Swagger documentation: http://localhost:${port}/api/docs`, 'Bootstrap');
}

bootstrap();

