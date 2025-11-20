import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';
import { UserSettings } from './user-settings.entity';
import { UserActivity, ActivityType } from './user-activity.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @InjectRepository(UserSettings)
    private settingsRepository: Repository<UserSettings>,
    @InjectRepository(UserActivity)
    private activityRepository: Repository<UserActivity>,
  ) {}

  async create(createUserDto: CreateUserDto): Promise<User> {
    const user = this.usersRepository.create(createUserDto);
    const savedUser = await this.usersRepository.save(user);
    
    // Создаем настройки по умолчанию
    const settings = this.settingsRepository.create({
      user: savedUser,
      language: 'ru',
      timezone: 'Europe/Moscow',
    });
    await this.settingsRepository.save(settings);
    
    return savedUser;
  }

  async findAll(): Promise<User[]> {
    return this.usersRepository.find({
      relations: ['settings'],
    });
  }

  async findOne(id: string): Promise<User> {
    const user = await this.usersRepository.findOne({
      where: { id },
      relations: ['settings'],
    });
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    return user;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({
      where: { email },
      relations: ['settings'],
    });
  }

  async findOneByResetToken(token: string): Promise<User | null> {
    return this.usersRepository.findOne({
      where: { passwordResetToken: token },
      relations: ['settings'],
    });
  }

  async update(id: string, updateUserDto: UpdateUserDto): Promise<User> {
    const user = await this.findOne(id);
    Object.assign(user, updateUserDto);
    return this.usersRepository.save(user);
  }

  async updateProfile(
    id: string,
    updateProfileDto: UpdateProfileDto,
  ): Promise<User> {
    const user = await this.findOne(id);
    Object.assign(user, updateProfileDto);
    const updatedUser = await this.usersRepository.save(user);
    
    // Записываем активность
    await this.logActivity(id, ActivityType.PROFILE_UPDATE, {
      changes: updateProfileDto,
    });
    
    return updatedUser;
  }

  async updateAvatar(id: string, filename: string | null): Promise<User> {
    const user = await this.findOne(id);
    
    // Удаляем старый аватар, если есть
    if (user.avatar) {
      const oldAvatarPath = path.join(process.cwd(), 'uploads', 'avatars', user.avatar);
      if (fs.existsSync(oldAvatarPath)) {
        fs.unlinkSync(oldAvatarPath);
      }
    }
    
    user.avatar = filename;
    const updatedUser = await this.usersRepository.save(user);
    
    // Записываем активность
    if (filename) {
      await this.logActivity(id, ActivityType.AVATAR_UPLOAD, {
        filename,
      });
    }
    
    return updatedUser;
  }

  async getSettings(userId: string): Promise<UserSettings> {
    const user = await this.findOne(userId);
    let settings = await this.settingsRepository.findOne({
      where: { user: { id: userId } },
    });
    
    if (!settings) {
      settings = this.settingsRepository.create({
        user,
        language: 'ru',
        timezone: 'Europe/Moscow',
      });
      await this.settingsRepository.save(settings);
    }
    
    return settings;
  }

  async updateSettings(
    userId: string,
    updateSettingsDto: UpdateSettingsDto,
  ): Promise<UserSettings> {
    let settings = await this.settingsRepository.findOne({
      where: { user: { id: userId } },
    });
    
    if (!settings) {
      const user = await this.findOne(userId);
      settings = this.settingsRepository.create({
        user,
        ...updateSettingsDto,
      });
    } else {
      Object.assign(settings, updateSettingsDto);
    }
    
    const updatedSettings = await this.settingsRepository.save(settings);
    
    // Записываем активность
    await this.logActivity(userId, ActivityType.SETTINGS_UPDATE, {
      changes: updateSettingsDto,
    });
    
    return updatedSettings;
  }

  async getActivities(
    userId: string,
    limit: number = 50,
  ): Promise<UserActivity[]> {
    return this.activityRepository.find({
      where: { user: { id: userId } },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  async logActivity(
    userId: string,
    type: ActivityType,
    metadata?: any,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<UserActivity> {
    const activity = this.activityRepository.create({
      user: { id: userId } as User,
      type,
      description: this.getActivityDescription(type, metadata),
      metadata,
      ipAddress,
      userAgent,
    });
    
    return this.activityRepository.save(activity);
  }

  private getActivityDescription(type: ActivityType, metadata?: any): string {
    const descriptions = {
      [ActivityType.LOGIN]: 'Вход в систему',
      [ActivityType.LOGOUT]: 'Выход из системы',
      [ActivityType.PROFILE_UPDATE]: 'Обновление профиля',
      [ActivityType.PASSWORD_CHANGE]: 'Изменение пароля',
      [ActivityType.AVATAR_UPLOAD]: 'Загрузка аватара',
      [ActivityType.SETTINGS_UPDATE]: 'Обновление настроек',
      [ActivityType.INTEGRATION_ADDED]: 'Добавлена интеграция',
      [ActivityType.INTEGRATION_REMOVED]: 'Удалена интеграция',
      [ActivityType.REPORT_GENERATED]: 'Сгенерирован отчет',
    };
    
    return descriptions[type] || 'Действие пользователя';
  }

  async remove(id: string): Promise<void> {
    const user = await this.findOne(id);
    
    // Удаляем аватар, если есть
    if (user.avatar) {
      const avatarPath = path.join(process.cwd(), 'uploads', 'avatars', user.avatar);
      if (fs.existsSync(avatarPath)) {
        fs.unlinkSync(avatarPath);
      }
    }
    
    await this.usersRepository.remove(user);
  }

  /**
   * GDPR: Экспорт всех данных пользователя
   */
  async exportUserData(userId: string): Promise<any> {
    const user = await this.findOne(userId);
    const settings = await this.getSettings(userId);
    const activities = await this.getActivities(userId, 1000);

    // Исключаем чувствительные данные
    const { password, passwordResetToken, passwordResetExpires, ...safeUser } = user;

    return {
      user: safeUser,
      settings,
      activities: activities.map((activity) => {
        // Исключаем IP адреса из экспорта (опционально)
        const { ipAddress, ...safeActivity } = activity;
        return safeActivity;
      }),
      exportedAt: new Date(),
    };
  }

  /**
   * GDPR: Полное удаление данных пользователя
   */
  async deleteUserData(userId: string): Promise<void> {
    // Удаляем все связанные данные через каскадное удаление
    // TypeORM автоматически удалит связанные записи благодаря onDelete: 'CASCADE'
    await this.remove(userId);
    
    // Логируем удаление (без персональных данных)
    console.log(`User data deleted: ${userId} at ${new Date().toISOString()}`);
  }
}

