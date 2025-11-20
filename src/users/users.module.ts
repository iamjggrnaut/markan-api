import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { User } from './user.entity';
import { UserSettings } from './user-settings.entity';
import { UserActivity } from './user-activity.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User, UserSettings, UserActivity])],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}

