import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { Payment } from './payment.entity';
import { User } from '../users/user.entity';
import { PlansModule } from '../plans/plans.module';
import { ConfigModule } from '@nestjs/config';
import { PaymentProviderFactory } from './providers/payment-provider.factory';
import { SBPProvider } from './providers/sbp.provider';
import { YooKassaProvider } from './providers/yookassa.provider';

@Module({
  imports: [
    TypeOrmModule.forFeature([Payment, User]),
    PlansModule,
    ConfigModule,
    ScheduleModule,
  ],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    PaymentProviderFactory,
    SBPProvider,
    YooKassaProvider,
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}

