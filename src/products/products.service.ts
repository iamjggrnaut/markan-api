import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Like, Between } from 'typeorm';
import { Product } from './product.entity';
import { ProductCategory } from './product-category.entity';
import { ProductStock } from './product-stock.entity';
import { ProductSale } from './product-sale.entity';
import { StockHistory } from './stock-history.entity';
import { IntegrationsService } from '../integrations/integrations.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductFilterDto } from './dto/product-filter.dto';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private productsRepository: Repository<Product>,
    @InjectRepository(ProductCategory)
    private categoriesRepository: Repository<ProductCategory>,
    @InjectRepository(ProductStock)
    private stocksRepository: Repository<ProductStock>,
    @InjectRepository(ProductSale)
    private salesRepository: Repository<ProductSale>,
    @InjectRepository(StockHistory)
    private stockHistoryRepository: Repository<StockHistory>,
    private integrationsService: IntegrationsService,
  ) {}

  async findAll(
    userId: string,
    organizationId: string | null,
    filter: ProductFilterDto,
  ): Promise<{ products: Product[]; total: number }> {
    try {
      const queryBuilder = this.productsRepository
        .createQueryBuilder('product')
        .leftJoinAndSelect('product.marketplaceAccount', 'account')
        .leftJoinAndSelect('product.category', 'category')
        .leftJoinAndSelect('product.stocks', 'stocks')
        .where('account.user.id = :userId', { userId });

    if (organizationId) {
      queryBuilder.andWhere('account.organization.id = :organizationId', {
        organizationId,
      });
    }

    // Фильтры (защита от SQL injection через параметризованные запросы)
    if (filter.search) {
      // Экранируем специальные символы для безопасности
      const sanitizedSearch = filter.search.replace(/[%_]/g, '\\$&');
      queryBuilder.andWhere(
        '(product.name ILIKE :search OR product.sku ILIKE :search OR product.barcode ILIKE :search)',
        { search: `%${sanitizedSearch}%` },
      );
    }

    if (filter.categoryId) {
      queryBuilder.andWhere('product.category.id = :categoryId', {
        categoryId: filter.categoryId,
      });
    }

    if (filter.marketplaceType) {
      queryBuilder.andWhere('account.marketplaceType = :marketplaceType', {
        marketplaceType: filter.marketplaceType,
      });
    }

    if (filter.minPrice !== undefined) {
      queryBuilder.andWhere('product.price >= :minPrice', {
        minPrice: filter.minPrice,
      });
    }

    if (filter.maxPrice !== undefined) {
      queryBuilder.andWhere('product.price <= :maxPrice', {
        maxPrice: filter.maxPrice,
      });
    }

    if (filter.inStock !== undefined) {
      if (filter.inStock) {
        queryBuilder.andWhere('product.availableStock > 0');
      } else {
        queryBuilder.andWhere('product.availableStock = 0');
      }
    }

    // Сортировка (защита от SQL injection - валидация полей)
    const allowedSortFields = ['createdAt', 'name', 'price', 'totalRevenue', 'totalSales', 'rating'];
    const sortField = allowedSortFields.includes(filter.sortBy || '') 
      ? filter.sortBy 
      : 'createdAt';
    const sortOrder = (filter.sortOrder?.toUpperCase() === 'ASC' || filter.sortOrder?.toUpperCase() === 'DESC')
      ? filter.sortOrder.toUpperCase()
      : 'DESC';
    queryBuilder.orderBy(`product.${sortField}`, sortOrder as 'ASC' | 'DESC');

    // Пагинация
    const page = filter.page || 1;
    const limit = filter.limit || 50;
    const skip = (page - 1) * limit;

    queryBuilder.skip(skip).take(limit);

      const [products, total] = await queryBuilder.getManyAndCount();

      return { products: products || [], total: total || 0 };
    } catch (error) {
      // Если произошла ошибка (например, нет аккаунтов), возвращаем пустой результат
      console.error('Failed to get products:', error);
      return { products: [], total: 0 };
    }
  }

  async findOne(id: string, userId: string): Promise<Product> {
    const product = await this.productsRepository.findOne({
      where: { id },
      relations: [
        'marketplaceAccount',
        'category',
        'stocks',
        'sales',
      ],
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }

    // Проверка доступа
    if (product.marketplaceAccount.user.id !== userId) {
      throw new NotFoundException('Product not found');
    }

    return product;
  }

  async findBySku(sku: string, userId: string): Promise<Product | null> {
    return this.productsRepository.findOne({
      where: { sku, marketplaceAccount: { user: { id: userId } } },
      relations: ['marketplaceAccount'],
    });
  }

  async syncProductsFromMarketplace(
    accountId: string,
    userId: string,
  ): Promise<{ created: number; updated: number }> {
    const account = await this.integrationsService.findOne(accountId, userId);
    const integration = await this.integrationsService.getIntegrationInstance(
      accountId,
      userId,
    );

    try {
      // Получаем товары с маркетплейса
      const marketplaceProducts = await integration.getProducts({
        limit: 10000,
      });

      let created = 0;
      let updated = 0;

      for (const mpProduct of marketplaceProducts) {
        // Ищем существующий товар
        let product = await this.productsRepository.findOne({
          where: {
            marketplaceAccount: { id: accountId },
            marketplaceProductId: mpProduct.id,
          },
        });

        if (product) {
          // Обновляем существующий товар
          Object.assign(product, {
            name: mpProduct.name,
            sku: mpProduct.sku || product.sku,
            barcode: mpProduct.barcode || product.barcode,
            price: mpProduct.price,
            images: mpProduct.images || [],
            description: mpProduct.description,
            lastSyncAt: new Date(),
          });
          updated++;
        } else {
          // Создаем новый товар
          product = this.productsRepository.create({
            marketplaceAccount: account,
            marketplaceProductId: mpProduct.id,
            name: mpProduct.name,
            sku: mpProduct.sku,
            barcode: mpProduct.barcode,
            price: mpProduct.price,
            images: mpProduct.images || [],
            description: mpProduct.description,
            lastSyncAt: new Date(),
          });
          created++;
        }

        await this.productsRepository.save(product);

        // Синхронизируем остатки
        await this.syncStockForProduct(product.id, accountId, userId);
      }

      await integration.disconnect();

      return { created, updated };
    } catch (error) {
      await integration.disconnect();
      throw new BadRequestException(`Failed to sync products: ${error.message}`);
    }
  }

  async syncStockForProduct(
    productId: string,
    accountId: string,
    userId: string,
  ): Promise<void> {
    const product = await this.findOne(productId, userId);
    const integration = await this.integrationsService.getIntegrationInstance(
      accountId,
      userId,
    );

    try {
      const stockData = await integration.getStock({
        productId: product.marketplaceProductId,
      });

      // Удаляем старые остатки для этого товара
      await this.stocksRepository.delete({ product: { id: productId } });

      let totalStock = 0;
      let reservedStock = 0;

      for (const stock of stockData) {
        if (stock.productId === product.marketplaceProductId) {
          const productStock = this.stocksRepository.create({
            product,
            marketplaceAccount: product.marketplaceAccount,
            warehouseId: stock.warehouseId,
            warehouseName: stock.warehouseName,
            quantity: stock.quantity || 0,
            reservedQuantity: stock.reservedQuantity || 0,
            availableQuantity: stock.availableQuantity || 0,
          });

          await this.stocksRepository.save(productStock);

          totalStock += stock.quantity || 0;
          reservedStock += stock.reservedQuantity || 0;
        }
      }

      // Сохраняем историю изменения остатков
      const previousStock = product.totalStock;
      if (previousStock !== totalStock) {
        const history = this.stockHistoryRepository.create({
          product,
          previousQuantity: previousStock,
          newQuantity: totalStock,
          difference: totalStock - previousStock,
          reason: 'sync',
        });
        await this.stockHistoryRepository.save(history);
      }

      // Обновляем общие остатки товара
      product.totalStock = totalStock;
      product.reservedStock = reservedStock;
      product.availableStock = totalStock - reservedStock;
      await this.productsRepository.save(product);

      await integration.disconnect();
    } catch (error) {
      await integration.disconnect();
      throw new BadRequestException(`Failed to sync stock: ${error.message}`);
    }
  }

  async create(createProductDto: CreateProductDto, userId: string): Promise<Product> {
    const account = await this.integrationsService.findOne(
      createProductDto.marketplaceAccountId,
      userId,
    );

    const product = this.productsRepository.create({
      ...createProductDto,
      marketplaceAccount: account,
    });

    return this.productsRepository.save(product);
  }

  async update(
    id: string,
    userId: string,
    updateProductDto: UpdateProductDto,
  ): Promise<Product> {
    const product = await this.findOne(id, userId);
    Object.assign(product, updateProductDto);
    return this.productsRepository.save(product);
  }

  async remove(id: string, userId: string): Promise<void> {
    const product = await this.findOne(id, userId);
    await this.productsRepository.remove(product);
  }

  // Категории
  async getCategories(
    userId: string,
    organizationId?: string,
  ): Promise<ProductCategory[]> {
    const where: any = { user: { id: userId } };
    if (organizationId) {
      where.organization = { id: organizationId };
    }

    return this.categoriesRepository.find({
      where,
      relations: ['parent', 'children'],
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
  }

  async createCategory(
    userId: string,
    organizationId: string | null,
    name: string,
    parentId?: string,
  ): Promise<ProductCategory> {
    const category = this.categoriesRepository.create({
      name,
      user: { id: userId } as any,
      organization: organizationId ? ({ id: organizationId } as any) : null,
      parent: parentId ? ({ id: parentId } as any) : null,
    });

    return this.categoriesRepository.save(category);
  }

  // Аналитика
  async getTopProducts(
    userId: string,
    organizationId: string | null,
    limit: number = 10,
    sortBy: 'revenue' | 'profit' | 'sales' = 'revenue',
  ): Promise<Product[]> {
    const queryBuilder = this.productsRepository
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.marketplaceAccount', 'account')
      .where('account.user.id = :userId', { userId });

    if (organizationId) {
      queryBuilder.andWhere('account.organization.id = :organizationId', {
        organizationId,
      });
    }

    queryBuilder
      .orderBy(`product.total${sortBy.charAt(0).toUpperCase() + sortBy.slice(1)}`, 'DESC')
      .take(limit);

    return queryBuilder.getMany();
  }

  async getABCAnalysis(
    userId: string,
    organizationId: string | null,
  ): Promise<any> {
    const products = await this.productsRepository
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.marketplaceAccount', 'account')
      .where('account.user.id = :userId', { userId })
      .andWhere(organizationId ? 'account.organization.id = :organizationId' : '1=1', {
        organizationId,
      })
      .orderBy('product.totalRevenue', 'DESC')
      .getMany();

    const totalRevenue = products.reduce(
      (sum, p) => sum + Number(p.totalRevenue),
      0,
    );

    let cumulativeRevenue = 0;
    const abcProducts = products.map((product) => {
      cumulativeRevenue += Number(product.totalRevenue);
      const revenueShare = (Number(product.totalRevenue) / totalRevenue) * 100;
      const cumulativeShare = (cumulativeRevenue / totalRevenue) * 100;

      let category = 'C';
      if (cumulativeShare <= 80) {
        category = 'A';
      } else if (cumulativeShare <= 95) {
        category = 'B';
      }

      return {
        product,
        revenueShare,
        cumulativeShare,
        category,
      };
    });

    return {
      total: products.length,
      categoryA: abcProducts.filter((p) => p.category === 'A').length,
      categoryB: abcProducts.filter((p) => p.category === 'B').length,
      categoryC: abcProducts.filter((p) => p.category === 'C').length,
      products: abcProducts,
    };
  }

  async calculateProfitability(productId: string, userId: string): Promise<any> {
    const product = await this.findOne(productId, userId);

    const sales = await this.salesRepository.find({
      where: { product: { id: productId } },
      order: { saleDate: 'DESC' },
      take: 1000,
    });

    const totalRevenue = sales.reduce(
      (sum, sale) => sum + Number(sale.totalAmount),
      0,
    );
    const totalCost = sales.reduce(
      (sum, sale) => sum + Number(sale.costPrice || 0) * sale.quantity,
      0,
    );
    const totalProfit = totalRevenue - totalCost;
    const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

    return {
      totalRevenue,
      totalCost,
      totalProfit,
      profitMargin,
      salesCount: sales.length,
    };
  }

  async getStockForecast(productId: string, userId: string): Promise<any> {
    try {
      const product = await this.findOne(productId, userId);

      if (!product) {
        return {
          forecastDepletionDays: null,
          averageDailySales: 0,
          message: 'Товар не найден',
        };
      }

      // Получаем продажи за последние 30 дней
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const recentSales = await this.salesRepository.find({
        where: {
          product: { id: productId },
          saleDate: Between(thirtyDaysAgo, new Date()),
        },
      });

      const totalSales = recentSales.reduce((sum, sale) => sum + sale.quantity, 0);
      const averageDailySales = totalSales / 30;

      if (averageDailySales === 0) {
        return {
          forecastDepletionDays: null,
          averageDailySales: 0,
          message: 'Нет данных о продажах',
        };
      }

      const forecastDepletionDays = Math.floor(
        product.availableStock / averageDailySales,
      );

      return {
        forecastDepletionDays,
        averageDailySales: Math.round(averageDailySales * 100) / 100,
        currentStock: product.availableStock,
        isCritical: forecastDepletionDays <= 7,
      };
    } catch (error) {
      // Если произошла ошибка, возвращаем безопасный ответ
      console.error(`Failed to get stock forecast for product ${productId}:`, error);
      return {
        forecastDepletionDays: null,
        averageDailySales: 0,
        message: 'Ошибка при расчете прогноза',
      };
    }
  }

  async getTurnoverRate(productId: string, userId: string): Promise<number> {
    const product = await this.findOne(productId, userId);

    // Получаем продажи за последние 90 дней
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const sales = await this.salesRepository.find({
      where: {
        product: { id: productId },
        saleDate: Between(ninetyDaysAgo, new Date()),
      },
    });

    const totalSales = sales.reduce((sum, sale) => sum + sale.quantity, 0);
    const averageStock = product.totalStock;

    if (averageStock === 0) {
      return 0;
    }

    // Оборачиваемость = (Продажи за период) / (Средний остаток)
    return Math.round((totalSales / averageStock) * 100) / 100;
  }

  async getStockHistory(
    productId: string,
    userId: string,
    limit: number = 100,
  ): Promise<StockHistory[]> {
    await this.findOne(productId, userId); // Проверка доступа

    return this.stockHistoryRepository.find({
      where: { product: { id: productId } },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  async getCriticalStockProducts(
    userId: string,
    organizationId: string | null,
    thresholdDays: number = 7,
  ): Promise<Product[]> {
    const queryBuilder = this.productsRepository
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.marketplaceAccount', 'account')
      .where('account.user.id = :userId', { userId })
      .andWhere('product.availableStock > 0');

    if (organizationId) {
      queryBuilder.andWhere('account.organization.id = :organizationId', {
        organizationId,
      });
    }

    const products = await queryBuilder.getMany();

    // Фильтруем товары с критическими остатками
    const criticalProducts: Product[] = [];

    for (const product of products) {
      const forecast = await this.getStockForecast(product.id, userId);
      if (
        forecast.forecastDepletionDays !== null &&
        forecast.forecastDepletionDays <= thresholdDays
      ) {
        criticalProducts.push(product);
      }
    }

    return criticalProducts;
  }

  async bulkUpdate(
    userId: string,
    productIds: string[],
    updateData: Partial<UpdateProductDto>,
  ): Promise<{ updated: number; failed: number }> {
    let updated = 0;
    let failed = 0;

    for (const productId of productIds) {
      try {
        await this.update(productId, userId, updateData);
        updated++;
      } catch (error) {
        failed++;
      }
    }

    return { updated, failed };
  }

  async syncSalesFromMarketplace(
    accountId: string,
    userId: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<{ created: number }> {
    const account = await this.integrationsService.findOne(accountId, userId);
    const integration = await this.integrationsService.getIntegrationInstance(
      accountId,
      userId,
    );

    try {
      const salesData = await integration.getSales({
        startDate: startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        endDate: endDate || new Date(),
        limit: 10000,
      });

      let created = 0;

      for (const sale of salesData) {
        // Находим товар
        let product = await this.productsRepository.findOne({
          where: {
            marketplaceAccount: { id: accountId },
            marketplaceProductId: sale.productId,
          },
        });

        // Если товар не найден, создаем его автоматически
        if (!product) {
          product = this.productsRepository.create({
            marketplaceAccount: account,
            marketplaceProductId: sale.productId,
            name: sale.productName || `Товар ${sale.productId}`,
            sku: sale.productId,
            price: sale.price || 0,
            totalStock: 0,
            availableStock: 0,
            reservedStock: 0,
            totalRevenue: 0,
            totalProfit: 0,
            totalSales: 0,
            lastSyncAt: new Date(),
          });
          product = await this.productsRepository.save(product);
        }

        // Проверяем, не существует ли уже такая продажа
        const existingSale = await this.salesRepository.findOne({
          where: {
            product: { id: product.id },
            orderId: sale.orderId,
            saleDate: sale.date,
          },
        });

        if (existingSale) {
          continue; // Пропускаем дубликаты
        }

        // Создаем запись о продаже
        const productSale = this.salesRepository.create({
          product,
          marketplaceAccount: account,
          saleDate: sale.date,
          quantity: sale.quantity,
          price: sale.price,
          totalAmount: sale.totalAmount,
          costPrice: product.costPrice,
          profit: product.costPrice
            ? sale.totalAmount - product.costPrice * sale.quantity
            : null,
          orderId: sale.orderId,
          region: sale.region,
        });

        await this.salesRepository.save(productSale);

        // Обновляем статистику товара
        product.totalSales += sale.quantity;
        product.totalRevenue += sale.totalAmount;
        if (productSale.profit) {
          product.totalProfit += productSale.profit;
        }

        // Обновляем остатки (уменьшаем при продаже)
        const previousStock = product.availableStock;
        product.availableStock = Math.max(0, product.availableStock - sale.quantity);
        product.totalStock = Math.max(0, product.totalStock - sale.quantity);

        // Сохраняем историю изменения остатков
        if (previousStock !== product.availableStock) {
          const history = this.stockHistoryRepository.create({
            product,
            previousQuantity: previousStock,
            newQuantity: product.availableStock,
            difference: product.availableStock - previousStock,
            reason: 'sale',
            metadata: { orderId: sale.orderId },
          });
          await this.stockHistoryRepository.save(history);
        }

        await this.productsRepository.save(product);
        created++;
      }

      await integration.disconnect();
      return { created };
    } catch (error) {
      await integration.disconnect();
      throw new BadRequestException(`Failed to sync sales: ${error.message}`);
    }
  }

  async getReorderRecommendations(
    userId: string,
    organizationId: string | null,
  ): Promise<any[]> {
    try {
      const products = await this.productsRepository
        .createQueryBuilder('product')
        .leftJoinAndSelect('product.marketplaceAccount', 'account')
        .where('account.user.id = :userId', { userId })
        .andWhere(organizationId ? 'account.organization.id = :organizationId' : '1=1', {
          organizationId,
        })
        .getMany();

      // Если у пользователя нет товаров, возвращаем пустой массив
      if (!products || products.length === 0) {
        return [];
      }

      const recommendations = [];

      for (const product of products) {
        try {
          const forecast = await this.getStockForecast(product.id, userId);

          if (
            forecast &&
            forecast.forecastDepletionDays !== null &&
            forecast.forecastDepletionDays <= 14
          ) {
            const recommendedQuantity = Math.ceil(
              forecast.averageDailySales * 30, // Запас на 30 дней
            );

            recommendations.push({
              product: {
                id: product.id,
                name: product.name,
                sku: product.sku,
              },
              currentStock: product.availableStock,
              forecastDepletionDays: forecast.forecastDepletionDays,
              averageDailySales: forecast.averageDailySales,
              recommendedQuantity,
              urgency: forecast.forecastDepletionDays <= 7 ? 'high' : 'medium',
            });
          }
        } catch (error) {
          // Пропускаем товары с ошибками прогноза
          console.error(`Failed to get forecast for product ${product.id}:`, error);
          continue;
        }
      }

      return recommendations.sort(
        (a, b) => (a.forecastDepletionDays || 0) - (b.forecastDepletionDays || 0),
      );
    } catch (error) {
      // Если произошла общая ошибка, возвращаем пустой массив
      console.error('Failed to get reorder recommendations:', error);
      return [];
    }
  }
}


