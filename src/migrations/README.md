# Миграции базы данных

## Важно для Production

В production окружении **ОБЯЗАТЕЛЬНО** отключить `synchronize: true` в `app.module.ts`:

```typescript
synchronize: process.env.NODE_ENV !== 'production',
```

Это уже настроено в коде. В production TypeORM не будет автоматически изменять схему БД.

## Использование миграций

### Создание миграции

```bash
npm run migration:create -- -n MigrationName
```

### Запуск миграций

```bash
npm run migration:run
```

### Откат миграции

```bash
npm run migration:revert
```

## Текущие индексы

Индексы для оптимизации уже созданы через SQL файл:
`src/optimization/database-indexes.migration.sql`

Для применения:
```bash
psql -U postgres -d nebula_markan -f src/optimization/database-indexes.migration.sql
```

## Рекомендации

1. **Всегда создавайте миграции** перед изменением схемы БД
2. **Тестируйте миграции** на staging окружении
3. **Делайте бэкап** перед применением миграций в production
4. **Используйте транзакции** для критичных миграций

