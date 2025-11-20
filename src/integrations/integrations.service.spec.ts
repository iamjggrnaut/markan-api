import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { IntegrationsService } from './integrations.service';
import { MarketplaceAccount, MarketplaceType, AccountStatus } from './marketplace-account.entity';
import { WebhookEvent } from './webhook-event.entity';
import { EncryptionService } from './encryption.service';
import { UsersService } from '../users/users.service';
import { MarketplaceFactoryService } from './marketplaces/marketplace-factory.service';

describe('IntegrationsService', () => {
  let service: IntegrationsService;
  let accountsRepository: Repository<MarketplaceAccount>;
  let encryptionService: EncryptionService;
  let usersService: UsersService;

  const mockAccountsRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    remove: jest.fn(),
  };

  const mockEncryptionService = {
    encrypt: jest.fn((value) => `encrypted_${value}`),
    decrypt: jest.fn((value) => value.replace('encrypted_', '')),
    encryptObject: jest.fn((obj) => `encrypted_${JSON.stringify(obj)}`),
  };

  const mockUsersService = {
    findOne: jest.fn(),
  };

  const mockMarketplaceFactory = {
    create: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IntegrationsService,
        {
          provide: getRepositoryToken(MarketplaceAccount),
          useValue: mockAccountsRepository,
        },
        {
          provide: getRepositoryToken(WebhookEvent),
          useValue: {},
        },
        {
          provide: EncryptionService,
          useValue: mockEncryptionService,
        },
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
        {
          provide: MarketplaceFactoryService,
          useValue: mockMarketplaceFactory,
        },
      ],
    }).compile();

    service = module.get<IntegrationsService>(IntegrationsService);
    accountsRepository = module.get<Repository<MarketplaceAccount>>(
      getRepositoryToken(MarketplaceAccount),
    );
    encryptionService = module.get<EncryptionService>(EncryptionService);
    usersService = module.get<UsersService>(UsersService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create marketplace account with encrypted credentials', async () => {
      const createDto = {
        marketplaceType: MarketplaceType.WILDBERRIES,
        accountName: 'Test Account',
        apiKey: 'test-api-key',
        apiSecret: 'test-secret',
      };

      const savedAccount = {
        id: '1',
        ...createDto,
        encryptedApiKey: 'encrypted_test-api-key',
        encryptedApiSecret: 'encrypted_test-secret',
        status: AccountStatus.INACTIVE,
        user: { id: 'user-1' },
      };

      mockUsersService.findOne.mockResolvedValue({ id: 'user-1' });
      mockAccountsRepository.create.mockReturnValue(savedAccount);
      mockAccountsRepository.save.mockResolvedValue(savedAccount);

      const result = await service.create('user-1', null, createDto);

      expect(result).toEqual(savedAccount);
      expect(mockEncryptionService.encrypt).toHaveBeenCalledWith('test-api-key');
      expect(mockAccountsRepository.save).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should return account if found', async () => {
      const mockAccount = {
        id: '1',
        accountName: 'Test Account',
        user: { id: 'user-1' },
      };

      mockAccountsRepository.findOne.mockResolvedValue(mockAccount);

      const result = await service.findOne('1', 'user-1');

      expect(result).toEqual(mockAccount);
    });

    it('should throw NotFoundException if account not found', async () => {
      mockAccountsRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne('1', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('testConnection', () => {
    it('should test connection and update status', async () => {
      const mockAccount = {
        id: '1',
        marketplaceType: MarketplaceType.WILDBERRIES,
        encryptedApiKey: 'encrypted_key',
        status: AccountStatus.INACTIVE,
      };

      const mockIntegration = {
        testConnection: jest.fn().mockResolvedValue(true),
      };

      mockAccountsRepository.findOne.mockResolvedValue(mockAccount);
      mockMarketplaceFactory.create.mockReturnValue(mockIntegration);
      mockEncryptionService.decrypt.mockReturnValue('decrypted_key');
      mockAccountsRepository.save.mockResolvedValue({
        ...mockAccount,
        status: AccountStatus.ACTIVE,
      });

      const result = await service.testConnection('1', 'user-1');

      expect(result).toBe(true);
      expect(mockAccountsRepository.save).toHaveBeenCalled();
    });
  });
});

