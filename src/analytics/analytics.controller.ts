import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { DashboardWidgetsService } from './dashboard-widgets.service';
import { CreateWidgetDto } from './dto/create-widget.dto';
import { UpdateWidgetDto } from './dto/update-widget.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Analytics')
@Controller('analytics')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AnalyticsController {
  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly widgetsService: DashboardWidgetsService,
  ) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Получить статистику для дашборда' })
  getDashboardStats(
    @Request() req,
    @Query('organizationId') organizationId: string | null,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate
      ? new Date(startDate)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    return this.analyticsService.getDashboardStats(
      req.user.userId,
      organizationId || null,
      start,
      end,
    );
  }

  @Get('kpi')
  @ApiOperation({ summary: 'Получить KPI метрики' })
  getKPIMetrics(
    @Request() req,
    @Query('organizationId') organizationId: string | null,
    @Query('period') period?: 'day' | 'week' | 'month',
  ) {
    return this.analyticsService.getKPIMetrics(
      req.user.userId,
      organizationId || null,
      period || 'month',
    );
  }

  @Get('ads')
  @ApiOperation({ summary: 'Получить аналитику по рекламе' })
  getAdAnalytics(
    @Request() req,
    @Query('organizationId') organizationId: string | null,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate
      ? new Date(startDate)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    return this.analyticsService.getAdAnalytics(
      req.user.userId,
      organizationId || null,
      start,
      end,
    );
  }

  @Get('ads/roi')
  @ApiOperation({ summary: 'Получить ROI рекламных кампаний' })
  getAdROI(
    @Request() req,
    @Query('organizationId') organizationId: string | null,
    @Query('campaignId') campaignId?: string,
  ) {
    return this.analyticsService.getAdROI(
      req.user.userId,
      organizationId || null,
      campaignId,
    );
  }

  @Get('ads/optimize')
  @ApiOperation({ summary: 'Получить рекомендации по оптимизации рекламных бюджетов' })
  optimizeAdBudgets(
    @Request() req,
    @Query('organizationId') organizationId: string | null,
  ) {
    return this.analyticsService.optimizeAdBudgets(
      req.user.userId,
      organizationId || null,
    );
  }

  // Виджеты
  @Get('widgets')
  @ApiOperation({ summary: 'Получить виджеты дашборда' })
  getWidgets(
    @Request() req,
    @Query('organizationId') organizationId: string | null,
  ) {
    return this.widgetsService.getWidgets(
      req.user.userId,
      organizationId || null,
    );
  }

  @Post('widgets')
  @ApiOperation({ summary: 'Создать виджет' })
  createWidget(
    @Request() req,
    @Body() createDto: CreateWidgetDto,
    @Query('organizationId') organizationId: string | null,
  ) {
    return this.widgetsService.createWidget(
      req.user.userId,
      organizationId || null,
      createDto,
    );
  }

  @Post('widgets/initialize')
  @ApiOperation({ summary: 'Инициализировать виджеты по умолчанию' })
  initializeWidgets(
    @Request() req,
    @Query('organizationId') organizationId: string | null,
  ) {
    return this.widgetsService.initializeDefaultWidgets(
      req.user.userId,
      organizationId || null,
    );
  }

  @Patch('widgets/:id')
  @ApiOperation({ summary: 'Обновить виджет' })
  updateWidget(
    @Request() req,
    @Param('id') id: string,
    @Body() updateDto: UpdateWidgetDto,
  ) {
    return this.widgetsService.updateWidget(id, req.user.userId, updateDto);
  }

  @Delete('widgets/:id')
  @ApiOperation({ summary: 'Удалить виджет' })
  deleteWidget(@Request() req, @Param('id') id: string) {
    return this.widgetsService.deleteWidget(id, req.user.userId);
  }

  @Post('widgets/reorder')
  @ApiOperation({ summary: 'Изменить порядок виджетов' })
  reorderWidgets(
    @Request() req,
    @Body('widgetIds') widgetIds: string[],
    @Query('organizationId') organizationId: string | null,
  ) {
    return this.widgetsService.reorderWidgets(
      req.user.userId,
      organizationId || null,
      widgetIds,
    );
  }
}

