import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UploadReceiptDto {
  @ApiProperty({ type: 'string', format: 'binary', description: 'Файл квитанции об оплате' })
  file: Express.Multer.File;
}

