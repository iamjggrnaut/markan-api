import { ApiProperty } from '@nestjs/swagger';
import * as classValidator from 'class-validator';

const { IsOptional, IsString, IsBoolean } = classValidator;

export class UpdateSettingsDto {
  @ApiProperty({ example: 'ru', required: false })
  @IsOptional()
  @IsString()
  language?: string;

  @ApiProperty({ example: 'Europe/Moscow', required: false })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @IsBoolean()
  emailNotifications?: boolean;

  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @IsBoolean()
  pushNotifications?: boolean;

  @ApiProperty({ example: false, required: false })
  @IsOptional()
  @IsBoolean()
  telegramNotifications?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  dashboardPreferences?: any;

  @ApiProperty({ required: false })
  @IsOptional()
  reportPreferences?: any;
}

