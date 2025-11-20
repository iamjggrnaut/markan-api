import { WinstonModuleOptions } from 'nest-winston';
import * as winston from 'winston';
import { ConfigService } from '@nestjs/config';

export const getLoggerConfig = (configService: ConfigService): WinstonModuleOptions => {
  const isProduction = configService.get<string>('NODE_ENV') === 'production';
  const logLevel = configService.get<string>('LOG_LEVEL') || (isProduction ? 'info' : 'debug');

  return {
    level: logLevel,
    format: winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      winston.format.errors({ stack: true }),
      winston.format.splat(),
      winston.format.json(),
    ),
    defaultMeta: { service: 'nebula-markan-api' },
    transports: [
      // Console transport
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.printf(
            ({ timestamp, level, message, context, ...meta }) => {
              const contextStr = context ? `[${context}]` : '';
              const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
              return `${timestamp} ${level} ${contextStr} ${message} ${metaStr}`;
            },
          ),
        ),
      }),
      // File transport для ошибок
      new winston.transports.File({
        filename: 'logs/error.log',
        level: 'error',
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.json(),
        ),
        maxsize: 5242880, // 5MB
        maxFiles: 5,
      }),
      // File transport для всех логов
      new winston.transports.File({
        filename: 'logs/combined.log',
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.json(),
        ),
        maxsize: 5242880, // 5MB
        maxFiles: 5,
      }),
    ],
    exceptionHandlers: [
      new winston.transports.File({ filename: 'logs/exceptions.log' }),
    ],
    rejectionHandlers: [
      new winston.transports.File({ filename: 'logs/rejections.log' }),
    ],
  };
};

