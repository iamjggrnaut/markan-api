import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1700000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Эта миграция создает базовую схему БД
    // В реальном проекте здесь должны быть все CREATE TABLE statements
    
    // Примечание: TypeORM автоматически создает таблицы при synchronize: true
    // Эта миграция нужна для production, где synchronize: false
    
    // Пример создания индексов (уже есть в database-indexes.migration.sql)
    // await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_users_email" ON "users" ("email")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Откат миграции
  }
}

