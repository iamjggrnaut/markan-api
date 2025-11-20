import { ApiProperty } from '@nestjs/swagger';
import * as classValidator from 'class-validator';

const { IsEnum, IsNotEmpty } = classValidator;

export enum GDPRRequestType {
  EXPORT = 'export', // Экспорт данных пользователя
  DELETE = 'delete', // Удаление данных пользователя
  RECTIFICATION = 'rectification', // Исправление данных
}

export class GDPRRequestDto {
  @ApiProperty({ enum: GDPRRequestType })
  @IsEnum(GDPRRequestType)
  @IsNotEmpty()
  type: GDPRRequestType;

  @ApiProperty({ required: false })
  reason?: string; // Причина запроса
}

