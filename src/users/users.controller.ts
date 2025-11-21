import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  UseGuards,
  Request,
  Query,
  Delete,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { GDPRRequestDto, GDPRRequestType } from './dto/gdpr-request.dto';

@ApiTags('Users')
@Controller('users')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Получить текущего пользователя' })
  getProfile(@Request() req) {
    return this.usersService.findOne(req.user.userId);
  }

  @Put('me')
  @ApiOperation({ summary: 'Обновить профиль' })
  updateProfile(@Request() req, @Body() updateDto: UpdateUserDto) {
    return this.usersService.update(req.user.userId, updateDto);
  }

  @Get('me/activities')
  @ApiOperation({ summary: 'Получить историю активности' })
  getMyActivities(@Request() req, @Query('limit') limit?: number) {
    return this.usersService.getActivities(req.user.userId, limit);
  }

  @Get('me/settings')
  @ApiOperation({ summary: 'Получить настройки пользователя' })
  getSettings(@Request() req) {
    return this.usersService.getSettings(req.user.userId);
  }

  @Put('me/settings')
  @ApiOperation({ summary: 'Обновить настройки пользователя' })
  updateSettings(@Request() req, @Body() updateSettingsDto: UpdateSettingsDto) {
    return this.usersService.updateSettings(req.user.userId, updateSettingsDto);
  }

  @Post('me/gdpr-request')
  @ApiOperation({ summary: 'GDPR запрос (экспорт/удаление данных)' })
  async handleGDPRRequest(@Request() req, @Body() dto: GDPRRequestDto) {
    const userId = req.user.userId;

    switch (dto.type) {
      case GDPRRequestType.EXPORT:
        return this.usersService.exportUserData(userId);
      
      case GDPRRequestType.DELETE:
        await this.usersService.deleteUserData(userId);
        return { message: 'Данные пользователя удалены' };
      
      case GDPRRequestType.RECTIFICATION:
        // Пользователь может обновить данные через PUT /users/me
        return { message: 'Используйте PUT /users/me для исправления данных' };
      
      default:
        throw new Error('Неизвестный тип GDPR запроса');
    }
  }
}
