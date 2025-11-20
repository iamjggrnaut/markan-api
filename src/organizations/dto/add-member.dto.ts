import { ApiProperty } from '@nestjs/swagger';
import * as classValidator from 'class-validator';
import { OrganizationRole } from '../organization-member.entity';

const { IsString, IsNotEmpty, IsOptional, IsEnum } = classValidator;

export class AddMemberDto {
  @ApiProperty({ example: 'user-id-uuid' })
  @IsString()
  @IsNotEmpty()
  userId: string;

  @ApiProperty({
    example: OrganizationRole.MEMBER,
    enum: OrganizationRole,
    required: false,
  })
  @IsOptional()
  @IsEnum(OrganizationRole)
  role?: OrganizationRole;
}

