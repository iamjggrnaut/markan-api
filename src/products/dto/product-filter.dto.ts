import { ApiProperty } from '@nestjs/swagger';
import * as classValidator from 'class-validator';
import { MarketplaceType } from '../../integrations/marketplace-account.entity';

const { IsOptional, IsString, IsNumber, IsBoolean, IsEnum, IsUUID, Min } = classValidator;

export class ProductFilterDto {
  @ApiProperty({ example: 'название товара', required: false })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({ example: 'category-uuid', required: false })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiProperty({
    example: MarketplaceType.WILDBERRIES,
    enum: MarketplaceType,
    required: false,
  })
  @IsOptional()
  @IsEnum(MarketplaceType)
  marketplaceType?: MarketplaceType;

  @ApiProperty({ example: 100, required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  minPrice?: number;

  @ApiProperty({ example: 5000, required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  maxPrice?: number;

  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @IsBoolean()
  inStock?: boolean;

  @ApiProperty({ example: 'name', required: false })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiProperty({ example: 'ASC', required: false, enum: ['ASC', 'DESC'] })
  @IsOptional()
  @IsString()
  sortOrder?: 'ASC' | 'DESC';

  @ApiProperty({ example: 1, required: false })
  @IsOptional()
  @IsNumber()
  @Min(1)
  page?: number;

  @ApiProperty({ example: 50, required: false })
  @IsOptional()
  @IsNumber()
  @Min(1)
  limit?: number;
}

