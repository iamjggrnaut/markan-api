import { PartialType } from '@nestjs/swagger';
import { CreateWidgetDto } from './create-widget.dto';
import * as classValidator from 'class-validator';

const { IsOptional, IsBoolean, IsInt } = classValidator;

export class UpdateWidgetDto extends PartialType(CreateWidgetDto) {
  @IsOptional()
  @IsBoolean()
  isVisible?: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsInt()
  position?: number;
}

