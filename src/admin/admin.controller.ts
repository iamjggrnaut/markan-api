import {
  Controller,
  Get,
  Put,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from './guards/admin.guard';
import { AdminService } from './admin.service';

@ApiTags('Admin')
@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
@ApiBearerAuth()
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('stats')
  @ApiOperation({ summary: 'Получить общую статистику системы' })
  getStats() {
    return this.adminService.getStats();
  }

  @Get('users')
  @ApiOperation({ summary: 'Получить список всех пользователей' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'role', required: false, type: String })
  @ApiQuery({ name: 'plan', required: false, type: String })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean })
  getAllUsers(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
    @Query('role') role?: string,
    @Query('plan') plan?: string,
    @Query('isActive') isActive?: boolean,
  ) {
    return this.adminService.getAllUsers(
      page ? Number(page) : 1,
      limit ? Number(limit) : 50,
      search,
      role,
      plan,
      isActive === undefined ? undefined : String(isActive) === 'true',
    );
  }

  @Get('users/:id')
  @ApiOperation({ summary: 'Получить детальную информацию о пользователе' })
  getUserDetails(@Param('id') id: string) {
    return this.adminService.getUserDetails(id);
  }

  @Get('users/:id/activity')
  @ApiOperation({ summary: 'Получить активность пользователя' })
  getUserActivity(@Param('id') id: string) {
    return this.adminService.getUserActivity(id);
  }

  @Put('users/:id')
  @ApiOperation({ summary: 'Обновить данные пользователя' })
  updateUser(
    @Param('id') id: string,
    @Body()
    updates: {
      role?: string;
      plan?: string;
      isActive?: boolean;
      firstName?: string;
      lastName?: string;
    },
  ) {
    return this.adminService.updateUser(id, updates);
  }

  @Delete('users/:id')
  @ApiOperation({ summary: 'Удалить пользователя' })
  deleteUser(@Param('id') id: string) {
    return this.adminService.deleteUser(id);
  }
}

