import { ApiProperty } from '@nestjs/swagger';
import * as classValidator from 'class-validator';

const { IsEmail, IsNotEmpty } = classValidator;

export class LoginDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'password123' })
  @IsNotEmpty()
  password: string;
}

