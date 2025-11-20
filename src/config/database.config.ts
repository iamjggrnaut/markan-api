import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';

export const getDatabaseConfig = (configService: ConfigService): TypeOrmModuleOptions => {
  const isProduction = configService.get<string>('NODE_ENV') === 'production';

  return {
    type: 'postgres',
    host: configService.get<string>('DB_HOST') || 'localhost',
    port: parseInt(configService.get<string>('DB_PORT') || '5432'),
    username: configService.get<string>('DB_USERNAME') || 'postgres',
    password: configService.get<string>('DB_PASSWORD') || 'postgres',
    database: configService.get<string>('DB_NAME') || 'nebula_markan',
    entities: [__dirname + '/../**/*.entity{.ts,.js}'],
    migrations: [__dirname + '/../migrations/**/*{.ts,.js}'],
    synchronize: !isProduction, // ВАЖНО: false в production!
    logging: !isProduction,
    migrationsRun: isProduction, // Автоматически запускать миграции в production
    migrationsTableName: 'migrations',
    ssl: isProduction && configService.get<string>('DB_SSL') === 'true' ? {
      rejectUnauthorized: false,
    } : false,
  };
};

