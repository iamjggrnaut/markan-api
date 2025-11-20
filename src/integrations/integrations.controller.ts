import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { IntegrationsService } from './integrations.service';
import { CreateMarketplaceAccountDto } from './dto/create-marketplace-account.dto';
import { UpdateMarketplaceAccountDto } from './dto/update-marketplace-account.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Integrations')
@Controller('integrations')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class IntegrationsController {
  constructor(private readonly integrationsService: IntegrationsService) {}

  @Post()
  @ApiOperation({ summary: 'Подключить аккаунт маркетплейса' })
  create(@Request() req, @Body() createDto: CreateMarketplaceAccountDto) {
    return this.integrationsService.create(
      req.user.userId,
      req.body.organizationId || null,
      createDto,
    );
  }

  @Get()
  @ApiOperation({ summary: 'Получить все подключенные аккаунты' })
  findAll(@Request() req, @Query('organizationId') organizationId?: string) {
    return this.integrationsService.findAll(
      req.user.userId,
      organizationId,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Получить аккаунт по ID' })
  findOne(@Request() req, @Param('id') id: string) {
    return this.integrationsService.findOne(id, req.user.userId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Обновить аккаунт маркетплейса' })
  update(
    @Request() req,
    @Param('id') id: string,
    @Body() updateDto: UpdateMarketplaceAccountDto,
  ) {
    return this.integrationsService.update(id, req.user.userId, updateDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Отключить аккаунт маркетплейса' })
  remove(@Request() req, @Param('id') id: string) {
    return this.integrationsService.remove(id, req.user.userId);
  }

  @Post(':id/test')
  @ApiOperation({ summary: 'Протестировать подключение' })
  testConnection(@Request() req, @Param('id') id: string) {
    return this.integrationsService.testConnection(id, req.user.userId);
  }

  @Get(':id/webhooks')
  @ApiOperation({ summary: 'Получить webhook события' })
  getWebhookEvents(
    @Request() req,
    @Param('id') id: string,
    @Query('limit') limit?: number,
  ) {
    return this.integrationsService.getWebhookEvents(
      id,
      req.user.userId,
      limit ? parseInt(limit.toString()) : 50,
    );
  }

  @Get(':id/sales')
  @ApiOperation({ summary: 'Получить данные о продажах' })
  async getSales(
    @Request() req,
    @Param('id') id: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const integration = await this.integrationsService.getIntegrationInstance(
      id,
      req.user.userId,
    );

    const params = {
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    };

    const sales = await integration.getSales(params);
    await integration.disconnect();

    return sales;
  }

  @Get(':id/products')
  @ApiOperation({ summary: 'Получить список товаров' })
  async getProducts(
    @Request() req,
    @Param('id') id: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    const integration = await this.integrationsService.getIntegrationInstance(
      id,
      req.user.userId,
    );

    const products = await integration.getProducts({
      limit: limit ? parseInt(limit.toString()) : undefined,
      offset: offset ? parseInt(offset.toString()) : undefined,
    });
    await integration.disconnect();

    return products;
  }

  @Get(':id/stock')
  @ApiOperation({ summary: 'Получить данные об остатках' })
  async getStock(@Request() req, @Param('id') id: string) {
    const integration = await this.integrationsService.getIntegrationInstance(
      id,
      req.user.userId,
    );

    const stock = await integration.getStock();
    await integration.disconnect();

    return stock;
  }

  @Get(':id/orders')
  @ApiOperation({ summary: 'Получить список заказов' })
  async getOrders(
    @Request() req,
    @Param('id') id: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const integration = await this.integrationsService.getIntegrationInstance(
      id,
      req.user.userId,
    );

    const orders = await integration.getOrders({
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });
    await integration.disconnect();

    return orders;
  }

  @Get(':id/regional')
  @ApiOperation({ summary: 'Получить региональные данные' })
  async getRegionalData(
    @Request() req,
    @Param('id') id: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const integration = await this.integrationsService.getIntegrationInstance(
      id,
      req.user.userId,
    );

    const regionalData = await integration.getRegionalData({
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });
    await integration.disconnect();

    return regionalData;
  }
}

