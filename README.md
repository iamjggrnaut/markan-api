# Nebula Markan API

Backend API для аналитического сервиса маркетплейсов.

## Технологии

- NestJS
- TypeScript
- TypeORM
- PostgreSQL
- JWT Authentication
- Swagger

## Установка

```bash
npm install
```

## Настройка

1. Скопируйте `.env.example` в `.env`
2. Настройте переменные окружения в `.env`
3. Убедитесь, что PostgreSQL запущен

## Запуск

```bash
# Разработка
npm run start:dev

# Production
npm run build
npm run start:prod
```

## API Документация

После запуска сервера, Swagger документация доступна по адресу:
http://localhost:3001/api/docs

## Структура проекта

```
src/
├── auth/          # Модуль аутентификации
├── users/          # Модуль пользователей
├── app.module.ts   # Главный модуль
├── app.controller.ts
├── app.service.ts
└── main.ts         # Точка входа
```

