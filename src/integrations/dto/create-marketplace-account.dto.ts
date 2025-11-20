import { ApiProperty } from '@nestjs/swagger';
import * as classValidator from 'class-validator';
import { MarketplaceType } from '../marketplace-account.entity';

const { IsString, IsNotEmpty, IsEnum, IsOptional, IsObject } = classValidator;

export class CreateMarketplaceAccountDto {
  @ApiProperty({
    example: MarketplaceType.WILDBERRIES,
    enum: MarketplaceType,
  })
  @IsEnum(MarketplaceType)
  @IsNotEmpty()
  marketplaceType: MarketplaceType;

  @ApiProperty({ example: 'Мой аккаунт Wildberries' })
  @IsString()
  @IsNotEmpty()
  accountName: string;

  @ApiProperty({ example: 'your-api-key-here' })
  @IsString()
  @IsNotEmpty()
  apiKey: string;

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
  credentials?: any;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsObject()
  syncSettings?: any;
}

