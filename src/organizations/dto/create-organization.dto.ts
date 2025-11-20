import { ApiProperty } from '@nestjs/swagger';
import * as classValidator from 'class-validator';

const { IsString, IsNotEmpty, IsOptional } = classValidator;

export class CreateOrganizationDto {
  @ApiProperty({ example: 'Моя компания' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'Описание компании', required: false })
  @IsOptional()
  @IsString()
  description?: string;
}

