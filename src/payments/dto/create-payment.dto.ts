import { IsEnum, IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { PlanType } from '../../plans/plan.entity';
import { ApiProperty } from '@nestjs/swagger';

export class CreatePaymentDto {
  @ApiProperty({ enum: PlanType, description: 'Тип тарифного плана' })
  @IsEnum(PlanType)
  @IsNotEmpty()
  planType: PlanType;

  @ApiProperty({ 
    description: 'Период подписки',
    enum: ['monthly', 'quarterly', 'semiAnnual', 'annual']
  })
  @IsString()
  @IsNotEmpty()
  billingPeriod: string;

  @ApiProperty({ 
    description: 'Провайдер платежей (sbp или yookassa). Если не указан, используется провайдер по умолчанию из конфига',
    enum: ['sbp', 'yookassa'],
    required: false
  })
  @IsString()
  @IsOptional()
  provider?: string;
}

