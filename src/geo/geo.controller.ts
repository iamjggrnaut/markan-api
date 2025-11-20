import {
  Controller,
  Get,
  Post,
  UseGuards,
  Request,
  Query,
  Param,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { GeoService } from './geo.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Geo Analytics')
@Controller('geo')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class GeoController {
  constructor(private readonly geoService: GeoService) {}

  @Get('regions')
  @ApiOperation({ summary: 'Получить региональную статистику' })
  getRegionalStats(
    @Request() req,
    @Query('organizationId') organizationId: string | null,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate
      ? new Date(startDate)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    return this.geoService.getRegionalStats(
      req.user.userId,
      organizationId || null,
      start,
      end,
    );
  }

  @Get('regions/:region')
  @ApiOperation({ summary: 'Получить детальную статистику по региону' })
  getRegionDetails(
    @Request() req,
    @Param('region') region: string,
    @Query('organizationId') organizationId: string | null,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate
      ? new Date(startDate)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    return this.geoService.getRegionDetails(
      req.user.userId,
      organizationId || null,
      decodeURIComponent(region),
      start,
      end,
    );
  }

  @Get('regions/comparison')
  @ApiOperation({ summary: 'Сравнение регионов' })
  getRegionalComparison(
    @Request() req,
    @Query('organizationId') organizationId: string | null,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('sortBy') sortBy?: 'revenue' | 'orders' | 'growth',
  ) {
    const start = startDate
      ? new Date(startDate)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    return this.geoService.getRegionalComparison(
      req.user.userId,
      organizationId || null,
      start,
      end,
      sortBy || 'revenue',
    );
  }

  @Get('regions/promising')
  @ApiOperation({ summary: 'Получить перспективные регионы' })
  getPromisingRegions(
    @Request() req,
    @Query('organizationId') organizationId: string | null,
    @Query('limit') limit?: number,
  ) {
    return this.geoService.getPromisingRegions(
      req.user.userId,
      organizationId || null,
      limit ? parseInt(limit.toString()) : 10,
    );
  }

  @Post('sync/:accountId')
  @ApiOperation({ summary: 'Синхронизировать региональные данные с маркетплейса' })
  syncRegionalData(
    @Request() req,
    @Param('accountId') accountId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.geoService.syncRegionalDataFromMarketplace(
      accountId,
      req.user.userId,
      req.user.organizationId || null,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
  }

  @Get('heatmap')
  @ApiOperation({ summary: 'Получить heat map популярности товаров по регионам' })
  getProductHeatMap(
    @Request() req,
    @Query('organizationId') organizationId: string | null,
    @Query('productId') productId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.geoService.getProductHeatMap(
      req.user.userId,
      organizationId || null,
      productId,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
  }

  @Get('logistics')
  @ApiOperation({ summary: 'Получить анализ логистических затрат' })
  getLogisticsAnalysis(
    @Request() req,
    @Query('organizationId') organizationId: string | null,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.geoService.getLogisticsAnalysis(
      req.user.userId,
      organizationId || null,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
  }

  @Get('export')
  @ApiOperation({ summary: 'Экспорт региональной аналитики' })
  exportRegionalAnalytics(
    @Request() req,
    @Query('organizationId') organizationId: string | null,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('format') format?: 'json' | 'csv',
  ) {
    const start = startDate
      ? new Date(startDate)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    return this.geoService.exportRegionalAnalytics(
      req.user.userId,
      organizationId || null,
      start,
      end,
      format || 'json',
    );
  }
}

