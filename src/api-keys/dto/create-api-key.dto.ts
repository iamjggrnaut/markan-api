import { ApiProperty } from '@nestjs/swagger';
import * as classValidator from 'class-validator';

const { IsString, IsNotEmpty, IsOptional, IsArray, IsDateString } = classValidator;

export class CreateApiKeyDto {
  @ApiProperty({ example: 'Production API Key' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'API key for external integration', required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    example: ['read:products', 'read:analytics'],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissions?: string[];

  @ApiProperty({ example: '2025-12-31T23:59:59Z', required: false })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

