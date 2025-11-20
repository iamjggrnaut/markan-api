-- Миграция для добавления индексов для оптимизации производительности
-- Выполнить: psql -U postgres -d nebula_markan -f database-indexes.migration.sql

-- Индексы для product_sales (уже добавлены в entity, но можно создать явно)
CREATE INDEX IF NOT EXISTS "IDX_product_sales_saleDate" ON "product_sales" ("saleDate");
CREATE INDEX IF NOT EXISTS "IDX_product_sales_orderId" ON "product_sales" ("orderId");
CREATE INDEX IF NOT EXISTS "IDX_product_sales_region_saleDate" ON "product_sales" ("region", "saleDate");

-- Индексы для users
CREATE INDEX IF NOT EXISTS "IDX_users_email" ON "users" ("email");
CREATE INDEX IF NOT EXISTS "IDX_users_plan_isActive" ON "users" ("plan", "isActive");

-- Индексы для products
CREATE INDEX IF NOT EXISTS "IDX_products_isActive" ON "products" ("isActive");
CREATE INDEX IF NOT EXISTS "IDX_products_category" ON "products" ("categoryId");
CREATE INDEX IF NOT EXISTS "IDX_products_totalRevenue" ON "products" ("totalRevenue");

-- Индексы для marketplace_accounts
CREATE INDEX IF NOT EXISTS "IDX_marketplace_accounts_status" ON "marketplace_accounts" ("status");
CREATE INDEX IF NOT EXISTS "IDX_marketplace_accounts_lastSyncAt" ON "marketplace_accounts" ("lastSyncAt");

-- Индексы для notifications
CREATE INDEX IF NOT EXISTS "IDX_notifications_type_createdAt" ON "notifications" ("type", "createdAt");
CREATE INDEX IF NOT EXISTS "IDX_notifications_isRead_createdAt" ON "notifications" ("isRead", "createdAt");

-- Индексы для reports
CREATE INDEX IF NOT EXISTS "IDX_reports_status_createdAt" ON "reports" ("status", "createdAt");
CREATE INDEX IF NOT EXISTS "IDX_reports_type_createdAt" ON "reports" ("type", "createdAt");

-- Индексы для ai_tasks
CREATE INDEX IF NOT EXISTS "IDX_ai_tasks_type_status" ON "ai_tasks" ("type", "status");
CREATE INDEX IF NOT EXISTS "IDX_ai_tasks_productId" ON "ai_tasks" ("productId");

-- Индексы для competitor_products
CREATE INDEX IF NOT EXISTS "IDX_competitor_products_date" ON "competitor_products" ("date");
CREATE INDEX IF NOT EXISTS "IDX_competitor_products_price" ON "competitor_products" ("price");

-- Композитные индексы для частых запросов
CREATE INDEX IF NOT EXISTS "IDX_product_sales_account_date" ON "product_sales" ("marketplaceAccountId", "saleDate");
CREATE INDEX IF NOT EXISTS "IDX_products_account_active" ON "products" ("marketplaceAccountId", "isActive");

-- Анализ таблиц для оптимизатора запросов
ANALYZE "product_sales";
ANALYZE "products";
ANALYZE "users";
ANALYZE "marketplace_accounts";

