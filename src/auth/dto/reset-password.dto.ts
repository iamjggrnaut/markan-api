import { ApiProperty } from '@nestjs/swagger';
import * as classValidator from 'class-validator';

const { IsString, MinLength, IsNotEmpty } = classValidator;

export class ResetPasswordDto {
  @ApiProperty({ example: 'reset-token-from-email' })
  @IsString()
  @IsNotEmpty()
  token: string;

  @ApiProperty({ example: 'newPassword123', minLength: 6 })
  @IsString()
  @MinLength(6)
  password: string;
}

