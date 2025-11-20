import { ApiProperty } from '@nestjs/swagger';
import * as classValidator from 'class-validator';

const { IsString, IsNotEmpty, IsOptional, IsEnum } = classValidator;
import { CompetitorStatus } from '../competitor.entity';

export class CreateCompetitorDto {
  @ApiProperty({ example: 'Конкурент 1' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'wildberries', required: false })
  @IsOptional()
  @IsString()
  marketplaceType?: string;

  @ApiProperty({ example: 'seller123', required: false })
  @IsOptional()
  @IsString()
  sellerId?: string;

  @ApiProperty({ example: 'https://example.com', required: false })
  @IsOptional()
  @IsString()
  url?: string;

  @ApiProperty({
    example: CompetitorStatus.ACTIVE,
    enum: CompetitorStatus,
    required: false,
  })
  @IsOptional()
  @IsEnum(CompetitorStatus)
  status?: CompetitorStatus;
}

