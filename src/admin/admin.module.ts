import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { User } from '../users/user.entity';
import { UserActivity } from '../users/user-activity.entity';
import { MarketplaceAccount } from '../integrations/marketplace-account.entity';
import { Product } from '../products/product.entity';
import { ProductSale } from '../products/product-sale.entity';
import { Organization } from '../organizations/organization.entity';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      UserActivity,
      MarketplaceAccount,
      Product,
      ProductSale,
      Organization,
    ]),
    UsersModule,
  ],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}

