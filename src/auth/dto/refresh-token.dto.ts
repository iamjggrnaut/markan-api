import { ApiProperty } from '@nestjs/swagger';
import * as classValidator from 'class-validator';

const { IsString, IsNotEmpty } = classValidator;

export class RefreshTokenDto {
  @ApiProperty({ example: 'your-refresh-token-here' })
  @IsString()
  @IsNotEmpty()
  refresh_token: string;
}

