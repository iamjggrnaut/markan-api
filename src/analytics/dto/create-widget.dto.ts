import { ApiProperty } from '@nestjs/swagger';
import * as classValidator from 'class-validator';
import { WidgetType } from '../dashboard-widget.entity';

const { IsEnum, IsString, IsNotEmpty, IsOptional, IsInt, IsObject, Min, Max } = classValidator;

export class CreateWidgetDto {
  @ApiProperty({
    example: WidgetType.REVENUE,
    enum: WidgetType,
  })
  @IsEnum(WidgetType)
  @IsNotEmpty()
  type: WidgetType;

  @ApiProperty({ example: 'Выручка' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ example: 1, minimum: 1, maximum: 4 })
  @IsInt()
  @Min(1)
  @Max(4)
  width: number;

  @ApiProperty({ example: 1, minimum: 1 })
  @IsInt()
  @Min(1)
  height: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsObject()
  config?: any;
}

