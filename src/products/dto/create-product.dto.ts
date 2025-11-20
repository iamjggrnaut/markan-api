import { ApiProperty } from '@nestjs/swagger';
import * as classValidator from 'class-validator';

const { IsString, IsNotEmpty, IsOptional, IsNumber, IsUUID, IsArray } = classValidator;

export class CreateProductDto {
  @ApiProperty({ example: 'account-uuid' })
  @IsUUID()
  @IsNotEmpty()
  marketplaceAccountId: string;

  @ApiProperty({ example: '12345678', required: false })
  @IsOptional()
  @IsString()
  sku?: string;

  @ApiProperty({ example: '4601234567890', required: false })
  @IsOptional()
  @IsString()
  barcode?: string;

  @ApiProperty({ example: 'Название товара' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'Описание товара', required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 'category-uuid', required: false })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiProperty({ example: 'Бренд', required: false })
  @IsOptional()
  @IsString()
  brand?: string;

  @ApiProperty({ example: 1000 })
  @IsNumber()
  @IsNotEmpty()
  price: number;

  @ApiProperty({ example: 500, required: false })
  @IsOptional()
  @IsNumber()
  costPrice?: number;

  @ApiProperty({ example: ['https://example.com/image.jpg'], required: false })
  @IsOptional()
  @IsArray()
  images?: string[];
}

