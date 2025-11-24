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
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductFilterDto } from './dto/product-filter.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Products')
@Controller('products')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  @ApiOperation({ summary: 'Создать товар' })
  create(@Request() req, @Body() createProductDto: CreateProductDto) {
    return this.productsService.create(createProductDto, req.user.userId);
  }

  @Get()
  @ApiOperation({ summary: 'Получить список товаров с фильтрацией' })
  findAll(
    @Request() req,
    @Query('organizationId') organizationId: string | null,
    @Query() filter: ProductFilterDto,
  ) {
    return this.productsService.findAll(
      req.user.userId,
      organizationId || null,
      filter,
    );
  }

  @Get('top')
  @ApiOperation({ summary: 'Получить топ товаров' })
  getTopProducts(
    @Request() req,
    @Query('organizationId') organizationId: string | null,
    @Query('limit') limit?: number,
    @Query('sortBy') sortBy?: 'revenue' | 'profit' | 'sales',
  ) {
    return this.productsService.getTopProducts(
      req.user.userId,
      organizationId || null,
      limit ? parseInt(limit.toString()) : 10,
      sortBy || 'revenue',
    );
  }

  @Get('abc-analysis')
  @ApiOperation({ summary: 'Получить ABC-анализ товаров' })
  getABCAnalysis(
    @Request() req,
    @Query('organizationId') organizationId: string | null,
  ) {
    return this.productsService.getABCAnalysis(
      req.user.userId,
      organizationId || null,
    );
  }

  @Get('critical-stock')
  @ApiOperation({ summary: 'Получить товары с критическими остатками' })
  getCriticalStock(
    @Request() req,
    @Query('organizationId') organizationId: string | null,
    @Query('thresholdDays') thresholdDays?: number,
  ) {
    return this.productsService.getCriticalStockProducts(
      req.user.userId,
      organizationId || null,
      thresholdDays ? parseInt(thresholdDays.toString()) : 7,
    );
  }

  @Get('reorder-recommendations')
  @ApiOperation({ summary: 'Получить рекомендации по дозаказу' })
  getReorderRecommendations(
    @Request() req,
    @Query('organizationId') organizationId: string | null,
  ) {
    return this.productsService.getReorderRecommendations(
      req.user.userId,
      organizationId || null,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Получить товар по ID' })
  findOne(@Request() req, @Param('id') id: string) {
    return this.productsService.findOne(id, req.user.userId);
  }

  @Get(':id/profitability')
  @ApiOperation({ summary: 'Рассчитать прибыльность товара' })
  getProfitability(@Request() req, @Param('id') id: string) {
    return this.productsService.calculateProfitability(id, req.user.userId);
  }

  @Get(':id/stock-forecast')
  @ApiOperation({ summary: 'Получить прогноз исчерпания остатков' })
  getStockForecast(@Request() req, @Param('id') id: string) {
    return this.productsService.getStockForecast(id, req.user.userId);
  }

  @Get(':id/turnover-rate')
  @ApiOperation({ summary: 'Получить оборачиваемость запасов' })
  getTurnoverRate(@Request() req, @Param('id') id: string) {
    return this.productsService.getTurnoverRate(id, req.user.userId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Обновить товар' })
  update(
    @Request() req,
    @Param('id') id: string,
    @Body() updateProductDto: UpdateProductDto,
  ) {
    return this.productsService.update(id, req.user.userId, updateProductDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Удалить товар' })
  remove(@Request() req, @Param('id') id: string) {
    return this.productsService.remove(id, req.user.userId);
  }

  @Post('sync/:accountId')
  @ApiOperation({ summary: 'Синхронизировать товары с маркетплейса' })
  syncProducts(@Request() req, @Param('accountId') accountId: string) {
    return this.productsService.syncProductsFromMarketplace(
      accountId,
      req.user.userId,
    );
  }

  @Post(':id/sync-stock')
  @ApiOperation({ summary: 'Синхронизировать остатки товара' })
  syncStock(
    @Request() req,
    @Param('id') id: string,
    @Body('accountId') accountId: string,
  ) {
    return this.productsService.syncStockForProduct(
      id,
      accountId,
      req.user.userId,
    );
  }

  @Get(':id/stock-history')
  @ApiOperation({ summary: 'Получить историю изменений остатков' })
  getStockHistory(
    @Request() req,
    @Param('id') id: string,
    @Query('limit') limit?: number,
  ) {
    return this.productsService.getStockHistory(
      id,
      req.user.userId,
      limit ? parseInt(limit.toString()) : 100,
    );
  }

  @Post('sync-sales/:accountId')
  @ApiOperation({ summary: 'Синхронизировать продажи с маркетплейса' })
  syncSales(
    @Request() req,
    @Param('accountId') accountId: string,
    @Body('startDate') startDate?: string,
    @Body('endDate') endDate?: string,
  ) {
    return this.productsService.syncSalesFromMarketplace(
      accountId,
      req.user.userId,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
  }

  @Post('bulk-update')
  @ApiOperation({ summary: 'Массовое обновление товаров' })
  bulkUpdate(
    @Request() req,
    @Body('productIds') productIds: string[],
    @Body('updateData') updateData: UpdateProductDto,
  ) {
    return this.productsService.bulkUpdate(
      req.user.userId,
      productIds,
      updateData,
    );
  }

  // Категории
  @Get('categories/list')
  @ApiOperation({ summary: 'Получить список категорий' })
  getCategories(
    @Request() req,
    @Query('organizationId') organizationId?: string,
  ) {
    return this.productsService.getCategories(
      req.user.userId,
      organizationId || null,
    );
  }

  @Post('categories')
  @ApiOperation({ summary: 'Создать категорию' })
  createCategory(
    @Request() req,
    @Body('name') name: string,
    @Body('organizationId') organizationId: string | null,
    @Body('parentId') parentId?: string,
  ) {
    return this.productsService.createCategory(
      req.user.userId,
      organizationId || null,
      name,
      parentId,
    );
  }
}

