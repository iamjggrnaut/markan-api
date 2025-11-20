import { ApiProperty } from '@nestjs/swagger';
import * as classValidator from 'class-validator';

const { IsEmail, MinLength, IsOptional, IsNotEmpty } = classValidator;

export class CreateUserDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: 'password123', minLength: 6 })
  @IsNotEmpty()
  @MinLength(6)
  password: string;

  @ApiProperty({ example: 'Иван', required: false })
  @IsOptional()
  firstName?: string;

  @ApiProperty({ example: 'Иванов', required: false })
  @IsOptional()
  lastName?: string;

  @ApiProperty({ example: 'free', required: false })
  @IsOptional()
  plan?: string;
}

