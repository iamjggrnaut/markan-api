import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MarketplaceAccount, MarketplaceType, AccountStatus } from './marketplace-account.entity';
import { WebhookEvent, WebhookEventType, WebhookEventStatus } from './webhook-event.entity';
import { EncryptionService } from './encryption.service';
import { UsersService } from '../users/users.service';
import { PlansService } from '../plans/plans.service';
import { CreateMarketplaceAccountDto } from './dto/create-marketplace-account.dto';
import { UpdateMarketplaceAccountDto } from './dto/update-marketplace-account.dto';
import { IMarketplaceIntegration, MarketplaceCredentials } from './interfaces/marketplace.interface';
import { MarketplaceFactoryService } from './marketplaces/marketplace-factory.service';

@Injectable()
export class IntegrationsService {
  constructor(
    @InjectRepository(MarketplaceAccount)
    public accountsRepository: Repository<MarketplaceAccount>,
    @InjectRepository(WebhookEvent)
    private webhookEventsRepository: Repository<WebhookEvent>,
    private encryptionService: EncryptionService,
    private usersService: UsersService,
    private plansService: PlansService,
    private marketplaceFactory: MarketplaceFactoryService,
  ) {}

  async create(
    userId: string,
    organizationId: string | null,
    createDto: CreateMarketplaceAccountDto,
  ): Promise<MarketplaceAccount> {
    // Проверяем лимиты тарифа
    await this.checkIntegrationLimits(userId, organizationId);

    // Шифруем API ключи
    const encryptedApiKey = this.encryptionService.encrypt(createDto.apiKey);
    const encryptedApiSecret = createDto.apiSecret
      ? this.encryptionService.encrypt(createDto.apiSecret)
      : null;
    const encryptedToken = createDto.token
      ? this.encryptionService.encrypt(createDto.token)
      : null;

    const account = this.accountsRepository.create({
      user: { id: userId } as any,
      organization: organizationId ? ({ id: organizationId } as any) : null,
      marketplaceType: createDto.marketplaceType,
      accountName: createDto.accountName,
      encryptedApiKey,
      encryptedApiSecret,
      encryptedToken,
      credentials: createDto.credentials
        ? this.encryptionService.encryptObject(createDto.credentials)
        : null,
      status: AccountStatus.INACTIVE,
      syncSettings: createDto.syncSettings || {},
    });

    const savedAccount = await this.accountsRepository.save(account);

    // Пытаемся подключиться
    try {
      await this.testConnection(savedAccount.id, userId);
    } catch (error) {
      savedAccount.status = AccountStatus.ERROR;
      savedAccount.lastError = error.message;
      await this.accountsRepository.save(savedAccount);
    }

    return savedAccount;
  }

  async findAll(userId: string, organizationId?: string): Promise<MarketplaceAccount[]> {
    const where: any = { user: { id: userId } };
    if (organizationId) {
      where.organization = { id: organizationId };
    }

    return this.accountsRepository.find({
      where,
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string, userId: string): Promise<MarketplaceAccount> {
    const account = await this.accountsRepository.findOne({
      where: { id, user: { id: userId } },
    });

    if (!account) {
      throw new NotFoundException(`Marketplace account with ID ${id} not found`);
    }

    return account;
  }

  async update(
    id: string,
    userId: string,
    updateDto: UpdateMarketplaceAccountDto,
  ): Promise<MarketplaceAccount> {
    const account = await this.findOne(id, userId);

    // Если обновляются API ключи, шифруем их
    if (updateDto.apiKey) {
      account.encryptedApiKey = this.encryptionService.encrypt(updateDto.apiKey);
    }
    if (updateDto.apiSecret !== undefined) {
      account.encryptedApiSecret = updateDto.apiSecret
        ? this.encryptionService.encrypt(updateDto.apiSecret)
        : null;
    }
    if (updateDto.token !== undefined) {
      account.encryptedToken = updateDto.token
        ? this.encryptionService.encrypt(updateDto.token)
        : null;
    }

    if (updateDto.accountName) {
      account.accountName = updateDto.accountName;
    }
    if (updateDto.syncSettings) {
      account.syncSettings = updateDto.syncSettings;
    }

    const updatedAccount = await this.accountsRepository.save(account);

    // Тестируем подключение если обновили ключи
    if (updateDto.apiKey || updateDto.apiSecret || updateDto.token) {
      try {
        await this.testConnection(id, userId);
      } catch (error) {
        updatedAccount.status = AccountStatus.ERROR;
        updatedAccount.lastError = error.message;
        await this.accountsRepository.save(updatedAccount);
      }
    }

    return updatedAccount;
  }

  async remove(id: string, userId: string): Promise<void> {
    const account = await this.findOne(id, userId);
    await this.accountsRepository.remove(account);
  }

  async testConnection(accountId: string, userId: string): Promise<boolean> {
    const account = await this.findOne(accountId, userId);

    // Получаем расшифрованные ключи
    const credentials = this.getDecryptedCredentials(account);

    // Создаем экземпляр интеграции
    const integration = this.marketplaceFactory.create(account.marketplaceType);
    
    try {
      await integration.connect(credentials);
      const isConnected = await integration.testConnection();
      
      if (isConnected) {
        account.status = AccountStatus.ACTIVE;
        account.lastError = null;
      } else {
        account.status = AccountStatus.ERROR;
        account.lastError = 'Connection test failed';
      }
      
      await this.accountsRepository.save(account);
      await integration.disconnect();
      
      return isConnected;
    } catch (error) {
      account.status = AccountStatus.ERROR;
      account.lastError = error.message;
      await this.accountsRepository.save(account);
      throw error;
    }
  }

  getDecryptedCredentials(account: MarketplaceAccount): MarketplaceCredentials {
    return {
      apiKey: account.encryptedApiKey
        ? this.encryptionService.decrypt(account.encryptedApiKey)
        : null,
      apiSecret: account.encryptedApiSecret
        ? this.encryptionService.decrypt(account.encryptedApiSecret)
        : null,
      token: account.encryptedToken
        ? this.encryptionService.decrypt(account.encryptedToken)
        : null,
      ...(account.credentials
        ? this.encryptionService.decryptObject(account.credentials)
        : {}),
    };
  }

  async createWebhookEvent(
    accountId: string,
    type: WebhookEventType,
    payload: any,
  ): Promise<WebhookEvent> {
    const account = await this.accountsRepository.findOne({
      where: { id: accountId },
    });

    if (!account) {
      throw new NotFoundException(`Account with ID ${accountId} not found`);
    }

    const event = this.webhookEventsRepository.create({
      account,
      type,
      payload,
      status: WebhookEventStatus.PENDING,
    });

    return this.webhookEventsRepository.save(event);
  }

  async processWebhookEvent(eventId: string): Promise<void> {
    const event = await this.webhookEventsRepository.findOne({
      where: { id: eventId },
      relations: ['account'],
    });

    if (!event) {
      throw new NotFoundException(`Webhook event with ID ${eventId} not found`);
    }

    try {
      // Для MVP: автоматическая обработка webhook событий отключена
      // События сохраняются в БД и могут быть обработаны через периодическую синхронизацию
      // В будущих версиях будет добавлена автоматическая обработка по типам событий
      // (ORDER_CREATED, STOCK_UPDATED, PRICE_UPDATED и т.д.)
      event.status = WebhookEventStatus.PROCESSED;
      event.processedAt = new Date();
      await this.webhookEventsRepository.save(event);
    } catch (error) {
      event.status = WebhookEventStatus.FAILED;
      event.error = error.message;
      event.retryCount += 1;
      await this.webhookEventsRepository.save(event);
      throw error;
    }
  }

  async getWebhookEvents(
    accountId: string,
    userId: string,
    limit: number = 50,
  ): Promise<WebhookEvent[]> {
    await this.findOne(accountId, userId); // Проверка доступа

    return this.webhookEventsRepository.find({
      where: { account: { id: accountId } },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  async getIntegrationInstance(
    accountId: string,
    userId: string,
  ): Promise<IMarketplaceIntegration> {
    const account = await this.findOne(accountId, userId);
    const credentials = this.getDecryptedCredentials(account);

    // Создаем экземпляр интеграции
    const integration = this.marketplaceFactory.create(account.marketplaceType);
    await integration.connect(credentials);

    return integration;
  }

  private async checkIntegrationLimits(
    userId: string,
    organizationId: string | null,
  ): Promise<void> {
    const user = await this.usersService.findOne(userId);
    const plan = await this.plansService.findByType(user.plan as any);

    // Если maxIntegrations = -1, значит без ограничений (Enterprise план)
    if (plan.maxIntegrations === -1) {
      return;
    }

    // Подсчитываем текущие интеграции
    const where: any = { user: { id: userId } };
    if (organizationId) {
      where.organization = { id: organizationId };
    }

    const currentIntegrationsCount = await this.accountsRepository.count({
      where,
    });

    // Проверяем лимит
    if (currentIntegrationsCount >= plan.maxIntegrations) {
      throw new ForbiddenException(
        `Достигнут лимит интеграций для вашего тарифа (${plan.maxIntegrations}). Обновите план для добавления большего количества интеграций.`,
      );
    }
  }
}

