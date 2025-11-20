import { ApiProperty } from '@nestjs/swagger';
import * as classValidator from 'class-validator';
import { SegmentType } from '../customer-segment.entity';

const { IsString, IsNotEmpty, IsEnum, IsOptional, IsObject } = classValidator;

export class CreateSegmentDto {
  @ApiProperty({ example: 'VIP клиенты' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    example: SegmentType.RFM,
    enum: SegmentType,
  })
  @IsEnum(SegmentType)
  @IsNotEmpty()
  type: SegmentType;

  @ApiProperty({ example: 'Клиенты с высоким LTV', required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    example: {
      rfm: {
        recency: { max: 30 },
        frequency: { min: 3 },
        monetary: { min: 10000 },
      },
    },
  })
  @IsObject()
  criteria: any;
}

