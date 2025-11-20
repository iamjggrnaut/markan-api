import { ApiProperty } from '@nestjs/swagger';
import * as classValidator from 'class-validator';

const { IsOptional, IsString, IsBoolean } = classValidator;

export class UpdateProfileDto {
  @ApiProperty({ example: 'Иван', required: false })
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiProperty({ example: 'Иванов', required: false })
  @IsOptional()
  @IsString()
  lastName?: string;
}

