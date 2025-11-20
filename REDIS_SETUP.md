# Настройка Redis для Nebula Markan

## Локальная разработка (без пароля)

Для локальной разработки Redis обычно работает без пароля. Просто установите Redis и используйте настройки:

```env
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
```

### Установка Redis на Windows

1. **Через WSL (рекомендуется)**:
   ```bash
   wsl
   sudo apt update
   sudo apt install redis-server
   sudo service redis-server start
   ```

2. **Через Docker**:
   ```bash
   docker run -d -p 6379:6379 --name redis redis:latest
   ```

3. **Через Memurai** (Windows-версия Redis):
   - Скачайте с https://www.memurai.com/
   - Установите и запустите

## Production (с паролем)

### 1. Установка пароля в Redis

**Если Redis уже установлен:**

1. Откройте конфигурационный файл Redis:
   - Linux: `/etc/redis/redis.conf`
   - Windows (Memurai): `C:\Program Files\Memurai\memurai.conf`

2. Найдите строку `# requirepass foobared` и раскомментируйте:
   ```
   requirepass ваш-надежный-пароль
   ```

3. Перезапустите Redis:
   ```bash
   # Linux
   sudo service redis-server restart
   
   # Windows (Memurai)
   # Перезапустите через Services
   ```

### 2. Генерация надежного пароля

Используйте длинный случайный пароль (минимум 32 символа):

```bash
# Linux/Mac
openssl rand -base64 32

# Или используйте онлайн генератор
```

### 3. Настройка в .env

```env
REDIS_HOST=your-redis-host
REDIS_PORT=6379
REDIS_PASSWORD=ваш-надежный-пароль-здесь
```

## Облачные решения

### Redis Cloud / Upstash

Если используете облачный Redis (Redis Cloud, Upstash, AWS ElastiCache):

1. Создайте аккаунт на сервисе
2. Создайте базу данных
3. Скопируйте:
   - Host (endpoint)
   - Port
   - Password (из настроек базы данных)

Пример для Upstash:
```env
REDIS_HOST=your-endpoint.upstash.io
REDIS_PORT=6379
REDIS_PASSWORD=your-upstash-password
```

## Проверка подключения

После настройки проверьте подключение:

```bash
# Без пароля
redis-cli ping
# Должно вернуть: PONG

# С паролем
redis-cli -a ваш-пароль ping
# Должно вернуть: PONG
```

## Безопасность

⚠️ **Важно для production:**
- Используйте сильный пароль (минимум 32 символа)
- Никогда не коммитьте пароль в Git
- Используйте переменные окружения
- Ограничьте доступ к Redis только с вашего сервера (firewall)
- Используйте SSL/TLS для production (если поддерживается)

## Для разработки

Если Redis не установлен, можно временно использовать **in-memory** хранилище для Bull (но это не рекомендуется для production):

В `app.module.ts` можно использовать альтернативу, но лучше установить Redis.

