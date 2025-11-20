import { ApiProperty } from '@nestjs/swagger';
import * as classValidator from 'class-validator';

const { IsEmail } = classValidator;

export class ForgotPasswordDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email: string;
}

