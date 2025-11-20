import { ApiProperty } from '@nestjs/swagger';
import * as classValidator from 'class-validator';

const { IsString, IsOptional, IsObject } = classValidator;

export class UpdateMarketplaceAccountDto {
  @ApiProperty({ example: 'Мой аккаунт Wildberries', required: false })
  @IsOptional()
  @IsString()
  accountName?: string;

  @ApiProperty({ example: 'your-api-key-here', required: false })
  @IsOptional()
  @IsString()
  apiKey?: string;

  @ApiProperty({ example: 'your-api-secret-here', required: false })
  @IsOptional()
  @IsString()
  apiSecret?: string;

  @ApiProperty({ example: 'your-token-here', required: false })
  @IsOptional()
  @IsString()
  token?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsObject()
  syncSettings?: any;
}

