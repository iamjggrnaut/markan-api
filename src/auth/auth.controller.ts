import { Controller, Post, Body, UseGuards, Request, Ip, Headers } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UsersService } from '../users/users.service';
import { ActivityType } from '../users/user-activity.entity';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
  ) {}

  @Post('register')
  @Throttle({ short: { limit: 2, ttl: 60000 } }) // 2 попытки в минуту
  @UseGuards(ThrottlerGuard)
  @ApiOperation({ summary: 'Регистрация нового пользователя' })
  @ApiBody({ type: RegisterDto })
  async register(@Body() registerDto: RegisterDto, @Ip() ip: string, @Headers('user-agent') userAgent: string) {
    const result = await this.authService.register(registerDto, ip, userAgent);
    
    // Логируем активность
    await this.usersService.logActivity(
      result.user.id,
      ActivityType.LOGIN,
      { action: 'register' },
      ip,
      userAgent,
    );
    
    return result;
  }

  @Post('login')
  @Throttle({ short: { limit: 5, ttl: 60000 } }) // 5 попыток в минуту
  @UseGuards(ThrottlerGuard)
  @ApiOperation({ summary: 'Авторизация пользователя' })
  @ApiBody({ type: LoginDto })
  async login(@Body() loginDto: LoginDto, @Ip() ip: string, @Headers('user-agent') userAgent: string) {
    const result = await this.authService.login(loginDto, ip, userAgent);
    
    // Логируем активность
    await this.usersService.logActivity(
      result.user.id,
      ActivityType.LOGIN,
      { action: 'login' },
      ip,
      userAgent,
    );
    
    return result;
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Обновление access token через refresh token' })
  @ApiBody({ type: RefreshTokenDto })
  async refresh(@Body() refreshTokenDto: RefreshTokenDto) {
    return this.authService.refreshToken(refreshTokenDto.refresh_token);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Выход из системы (отзыв refresh token)' })
  async logout(@Request() req, @Body() refreshTokenDto: RefreshTokenDto) {
    await this.authService.revokeToken(refreshTokenDto.refresh_token, req.user.userId);
    
    // Логируем активность
    await this.usersService.logActivity(
      req.user.userId,
      ActivityType.LOGOUT,
      { action: 'logout' },
    );
    
    return { message: 'Выход выполнен успешно' };
  }

  @Post('forgot-password')
  @Throttle({ short: { limit: 3, ttl: 3600000 } }) // 3 попытки в час
  @UseGuards(ThrottlerGuard)
  @ApiOperation({ summary: 'Запрос на восстановление пароля' })
  @ApiBody({ type: ForgotPasswordDto })
  async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    return this.authService.forgotPassword(forgotPasswordDto.email);
  }

  @Post('reset-password')
  @Throttle({ short: { limit: 5, ttl: 3600000 } }) // 5 попыток в час
  @UseGuards(ThrottlerGuard)
  @ApiOperation({ summary: 'Сброс пароля по токену' })
  @ApiBody({ type: ResetPasswordDto })
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    return this.authService.resetPassword(
      resetPasswordDto.token,
      resetPasswordDto.password,
    );
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Смена пароля авторизованным пользователем' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        oldPassword: { type: 'string' },
        newPassword: { type: 'string' },
      },
      required: ['oldPassword', 'newPassword'],
    },
  })
  async changePassword(
    @Request() req,
    @Body() body: { oldPassword: string; newPassword: string },
  ) {
    return this.authService.changePassword(
      req.user.userId,
      body.oldPassword,
      body.newPassword,
    );
  }
}

