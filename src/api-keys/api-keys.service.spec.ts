import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UnauthorizedException } from '@nestjs/common';
import { ApiKeysService } from './api-keys.service';
import { ApiKey } from './api-key.entity';

describe('ApiKeysService', () => {
  let service: ApiKeysService;
  let repository: Repository<ApiKey>;

  const mockRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiKeysService,
        {
          provide: getRepositoryToken(ApiKey),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<ApiKeysService>(ApiKeysService);
    repository = module.get<Repository<ApiKey>>(getRepositoryToken(ApiKey));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create and return API key with raw key', async () => {
      const createDto = {
        name: 'Test Key',
        description: 'Test description',
      };

      const savedKey = {
        id: '1',
        ...createDto,
        key: 'hashed-key',
        user: { id: 'user-1' },
        organization: null,
      };

      mockRepository.create.mockReturnValue(savedKey);
      mockRepository.save.mockResolvedValue(savedKey);

      const result = await service.create('user-1', null, createDto);

      expect(result).toHaveProperty('key');
      expect(result.key).toMatch(/^nm_/);
      expect(result.apiKey).toEqual(savedKey);
      expect(mockRepository.save).toHaveBeenCalled();
    });
  });

  describe('validateKey', () => {
    it('should return API key if valid', async () => {
      const rawKey = 'nm_test123';
      const hashedKey1 = service['hashKey'](rawKey);

      const mockKey = {
        id: '1',
        key: hashedKey1,
        isActive: true,
        expiresAt: null,
        user: { id: 'user-1' },
        organization: null,
        lastUsedAt: null,
        usageCount: 0,
      };

      mockRepository.findOne.mockResolvedValue(mockKey);
      mockRepository.save.mockResolvedValue(mockKey);

      // Используем приватный метод для хеширования
      const hashedKey2 = service['hashKey'](rawKey);
      mockRepository.findOne.mockResolvedValue({
        ...mockKey,
        key: hashedKey2,
      });

      const result = await service.validateKey(rawKey);

      expect(result).toBeDefined();
      expect(mockRepository.save).toHaveBeenCalled();
    });

    it('should throw UnauthorizedException if key not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.validateKey('invalid-key')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException if key expired', async () => {
      const expiredKey = {
        id: '1',
        key: 'hashed-key',
        isActive: true,
        expiresAt: new Date(Date.now() - 1000),
      };

      mockRepository.findOne.mockResolvedValue(expiredKey);

      await expect(service.validateKey('test-key')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('findAll', () => {
    it('should return all API keys for user', async () => {
      const mockKeys = [
        { id: '1', name: 'Key 1', user: { id: 'user-1' } },
        { id: '2', name: 'Key 2', user: { id: 'user-1' } },
      ];

      mockRepository.find.mockResolvedValue(mockKeys);

      const result = await service.findAll('user-1', null);

      expect(result).toEqual(mockKeys);
      expect(mockRepository.find).toHaveBeenCalled();
    });
  });
});

