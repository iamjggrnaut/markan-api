import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { ApiKey } from './api-key.entity';
import { CreateApiKeyDto } from './dto/create-api-key.dto';
import { UpdateApiKeyDto } from './dto/update-api-key.dto';

@Injectable()
export class ApiKeysService {
  constructor(
    @InjectRepository(ApiKey)
    private apiKeysRepository: Repository<ApiKey>,
  ) {}

  async create(
    userId: string,
    organizationId: string | null,
    createDto: CreateApiKeyDto,
  ): Promise<{ key: string; apiKey: ApiKey }> {
    // Генерируем случайный ключ
    const rawKey = this.generateKey();
    const hashedKey = this.hashKey(rawKey);

    const apiKey = this.apiKeysRepository.create({
      ...createDto,
      key: hashedKey,
      user: { id: userId } as any,
      organization: organizationId ? ({ id: organizationId } as any) : null,
    });

    const saved = await this.apiKeysRepository.save(apiKey);

    return {
      key: rawKey, // Возвращаем только один раз
      apiKey: saved,
    };
  }

  async findAll(
    userId: string,
    organizationId: string | null,
  ): Promise<ApiKey[]> {
    const where: any = { user: { id: userId } };
    if (organizationId) {
      where.organization = { id: organizationId };
    }

    return this.apiKeysRepository.find({
      where,
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string, userId: string): Promise<ApiKey> {
    const apiKey = await this.apiKeysRepository.findOne({
      where: { id, user: { id: userId } },
    });

    if (!apiKey) {
      throw new Error(`API key with ID ${id} not found`);
    }

    return apiKey;
  }

  async update(
    id: string,
    userId: string,
    updateDto: UpdateApiKeyDto,
  ): Promise<ApiKey> {
    const apiKey = await this.findOne(id, userId);
    Object.assign(apiKey, updateDto);

    return this.apiKeysRepository.save(apiKey);
  }

  async delete(id: string, userId: string): Promise<void> {
    const apiKey = await this.findOne(id, userId);
    await this.apiKeysRepository.remove(apiKey);
  }

  async validateKey(key: string): Promise<ApiKey> {
    const hashedKey = this.hashKey(key);

    const apiKey = await this.apiKeysRepository.findOne({
      where: { key: hashedKey, isActive: true },
      relations: ['user', 'organization'],
    });

    if (!apiKey) {
      throw new UnauthorizedException('Invalid API key');
    }

    // Проверяем срок действия
    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
      throw new UnauthorizedException('API key has expired');
    }

    // Обновляем статистику использования
    apiKey.lastUsedAt = new Date();
    apiKey.usageCount += 1;
    await this.apiKeysRepository.save(apiKey);

    return apiKey;
  }

  private generateKey(): string {
    const prefix = 'nm_'; // Nebula Markan prefix
    const randomBytes = crypto.randomBytes(32);
    const key = randomBytes.toString('base64url');
    return `${prefix}${key}`;
  }

  private hashKey(key: string): string {
    return crypto.createHash('sha256').update(key).digest('hex');
  }
}

