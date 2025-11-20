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
import { CompetitorsService } from './competitors.service';
import { CreateCompetitorDto } from './dto/create-competitor.dto';
import { UpdateCompetitorDto } from './dto/update-competitor.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Competitors')
@Controller('competitors')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class CompetitorsController {
  constructor(private readonly competitorsService: CompetitorsService) {}

  @Post()
  @ApiOperation({ summary: 'Добавить конкурента' })
  create(
    @Request() req,
    @Body() createDto: CreateCompetitorDto,
    @Query('organizationId') organizationId?: string,
  ) {
    return this.competitorsService.create(
      req.user.userId,
      organizationId || null,
      createDto,
    );
  }

  @Get()
  @ApiOperation({ summary: 'Получить список конкурентов' })
  findAll(
    @Request() req,
    @Query('organizationId') organizationId?: string,
  ) {
    return this.competitorsService.findAll(
      req.user.userId,
      organizationId || null,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Получить конкурента' })
  findOne(@Request() req, @Param('id') id: string) {
    return this.competitorsService.findOne(id, req.user.userId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Обновить конкурента' })
  update(
    @Request() req,
    @Param('id') id: string,
    @Body() updateDto: UpdateCompetitorDto,
  ) {
    return this.competitorsService.update(id, req.user.userId, updateDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Удалить конкурента' })
  remove(@Request() req, @Param('id') id: string) {
    return this.competitorsService.remove(id, req.user.userId);
  }

  @Post(':id/track-product/:productId')
  @ApiOperation({ summary: 'Отслеживать товар конкурента' })
  trackProduct(
    @Request() req,
    @Param('id') competitorId: string,
    @Param('productId') productId: string,
    @Body() productData: any,
  ) {
    return this.competitorsService.trackProduct(
      competitorId,
      req.user.userId,
      productId,
      productData,
    );
  }

  @Get(':id/products')
  @ApiOperation({ summary: 'Получить отслеживаемые товары конкурента' })
  getCompetitorProducts(
    @Request() req,
    @Param('id') competitorId: string,
    @Query('productId') productId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.competitorsService.getCompetitorProducts(
      competitorId,
      req.user.userId,
      productId,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
  }

  @Get('compare-prices/:productId')
  @ApiOperation({ summary: 'Сравнить цены с конкурентами' })
  comparePrices(
    @Request() req,
    @Param('productId') productId: string,
    @Query('organizationId') organizationId?: string,
  ) {
    return this.competitorsService.comparePrices(
      req.user.userId,
      organizationId || null,
      productId,
    );
  }

  @Get('analytics')
  @ApiOperation({ summary: 'Получить аналитику по конкурентам' })
  getAnalytics(
    @Request() req,
    @Query('organizationId') organizationId?: string,
    @Query('competitorId') competitorId?: string,
  ) {
    return this.competitorsService.getCompetitorAnalytics(
      req.user.userId,
      organizationId || null,
      competitorId,
    );
  }

  @Get('price-gaps')
  @ApiOperation({ summary: 'Найти ценовые ниши (где мы дороже конкурентов)' })
  findPriceGaps(
    @Request() req,
    @Query('organizationId') organizationId?: string,
    @Query('threshold') threshold?: number,
  ) {
    return this.competitorsService.findPriceGaps(
      req.user.userId,
      organizationId || null,
      threshold ? parseFloat(threshold.toString()) : 10,
    );
  }

  @Post(':id/promotions')
  @ApiOperation({ summary: 'Отслеживать акцию конкурента' })
  trackPromotion(
    @Request() req,
    @Param('id') competitorId: string,
    @Body() promotionData: any,
  ) {
    return this.competitorsService.trackPromotion(
      competitorId,
      req.user.userId,
      promotionData,
    );
  }

  @Get('promotions/active')
  @ApiOperation({ summary: 'Получить активные акции конкурентов' })
  getActivePromotions(
    @Request() req,
    @Query('organizationId') organizationId?: string,
    @Query('competitorId') competitorId?: string,
  ) {
    return this.competitorsService.getActivePromotions(
      req.user.userId,
      organizationId || null,
      competitorId,
    );
  }
}

