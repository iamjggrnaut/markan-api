import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { MailService } from '../mail/mail.service';
import { PlansService } from '../plans/plans.service';
import { PlanType } from '../plans/plan.entity';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshToken } from './refresh-token.entity';
import { ActivityType } from '../users/user-activity.entity';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private mailService: MailService,
    private plansService: PlansService,
    @InjectRepository(RefreshToken)
    private refreshTokenRepository: Repository<RefreshToken>,
  ) {}

  async validateUser(email: string, password: string): Promise<any> {
    const user = await this.usersService.findByEmail(email);
    if (user && (await bcrypt.compare(password, user.password))) {
      const { password, ...result } = user;
      return result;
    }
    return null;
  }

  async login(loginDto: LoginDto, ipAddress?: string, userAgent?: string) {
    const user = await this.validateUser(loginDto.email, loginDto.password);
    if (!user) {
      throw new UnauthorizedException('Неверный email или пароль');
    }
    return this.generateTokens(user, ipAddress, userAgent);
  }

  async register(registerDto: RegisterDto, ipAddress?: string, userAgent?: string) {
    const existingUser = await this.usersService.findByEmail(registerDto.email);
    if (existingUser) {
      throw new UnauthorizedException('Пользователь с таким email уже существует');
    }

    const hashedPassword = await bcrypt.hash(registerDto.password, 10);
    const user = await this.usersService.create({
      ...registerDto,
      password: hashedPassword,
    });

    // Создаем 1 день пробного периода для базового тарифа
    try {
      await this.plansService.startTrial(user.id, PlanType.BASIC);
    } catch (error) {
      console.error('Failed to start trial:', error);
    }

    // Отправляем welcome email (не блокируем регистрацию при ошибке)
    try {
      await this.mailService.sendWelcomeEmail(user.email, user.firstName);
    } catch (error) {
      console.error('Failed to send welcome email:', error);
    }

    // Обновляем user для получения актуальных данных о trial
    const updatedUser = await this.usersService.findOne(user.id);
    const { password, ...result } = updatedUser;
    return this.generateTokens(result, ipAddress, userAgent);
  }

  async refreshToken(refreshToken: string) {
    const token = await this.refreshTokenRepository.findOne({
      where: { token: refreshToken },
      relations: ['user'],
    });

    if (!token || token.isRevoked || token.expiresAt < new Date()) {
      throw new UnauthorizedException('Недействительный refresh token');
    }

    const { password, ...user } = token.user;
    return this.generateTokens(user);
  }

  async revokeToken(refreshToken: string, userId: string) {
    const token = await this.refreshTokenRepository.findOne({
      where: { token: refreshToken, user: { id: userId } },
    });

    if (token) {
      token.isRevoked = true;
      await this.refreshTokenRepository.save(token);
    }
  }

  async revokeAllUserTokens(userId: string) {
    await this.refreshTokenRepository.update(
      { user: { id: userId }, isRevoked: false },
      { isRevoked: true },
    );
  }

  async forgotPassword(email: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      // Не раскрываем информацию о существовании пользователя
      return { message: 'Если пользователь с таким email существует, письмо отправлено' };
    }

    // Генерируем токен для сброса пароля
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetExpires = new Date();
    resetExpires.setHours(resetExpires.getHours() + 1); // Токен действителен 1 час

    // Сохраняем токен в БД
    await this.usersService.update(user.id, {
      passwordResetToken: resetToken,
      passwordResetExpires: resetExpires,
    } as any);

    // Отправляем email с токеном
    try {
      await this.mailService.sendPasswordResetEmail(email, resetToken);
    } catch (error) {
      // Логируем ошибку, но не раскрываем информацию о существовании пользователя
      console.error('Failed to send password reset email:', error);
    }

    return {
      message: 'Если пользователь с таким email существует, письмо отправлено',
    };
  }

  async resetPassword(token: string, newPassword: string) {
    const user = await this.usersService.findOneByResetToken(token);
    if (!user || !user.passwordResetExpires || user.passwordResetExpires < new Date()) {
      throw new BadRequestException('Недействительный или истекший токен сброса пароля');
    }

    // Хешируем новый пароль
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    // Обновляем пароль и очищаем токен
    await this.usersService.update(user.id, {
      password: hashedPassword,
      passwordResetToken: null,
      passwordResetExpires: null,
    } as any);

    // Отзываем все refresh токены пользователя
    await this.revokeAllUserTokens(user.id);

    // Логируем активность
    await this.usersService.logActivity(
      user.id,
      ActivityType.PASSWORD_CHANGE,
      { action: 'password_reset' },
    );

    return { message: 'Пароль успешно изменен' };
  }

  private async generateTokens(user: any, ipAddress?: string, userAgent?: string) {
    const payload = { 
      email: user.email, 
      sub: user.id,
      role: user.role || 'user', // Включаем роль в токен
    };
    const accessToken = this.jwtService.sign(payload);
    
    // Генерируем refresh token
    const refreshTokenValue = crypto.randomBytes(40).toString('hex');
    const expiresIn = this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') || '7d';
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 дней по умолчанию

    // Сохраняем refresh token в БД
    const refreshToken = this.refreshTokenRepository.create({
      user: { id: user.id } as any,
      token: refreshTokenValue,
      expiresAt,
      ipAddress,
      userAgent,
    });
    await this.refreshTokenRepository.save(refreshToken);

    return {
      access_token: accessToken,
      refresh_token: refreshTokenValue,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        plan: user.plan,
        role: user.role || 'user',
      },
    };
  }
}

