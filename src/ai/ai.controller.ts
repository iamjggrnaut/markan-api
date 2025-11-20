import {
  Controller,
  Get,
  Post,
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
import { AIService } from './ai.service';
import { AITaskType } from './ai-task.entity';
import { RecommendationType } from './ai-recommendation.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('AI')
@Controller('ai')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AIController {
  constructor(private readonly aiService: AIService) {}

  @Post('tasks')
  @ApiOperation({ summary: 'Создать AI задачу' })
  createTask(
    @Request() req,
    @Body('type') type: AITaskType,
    @Body('inputParams') inputParams: any,
    @Body('productId') productId?: string,
    @Query('organizationId') organizationId?: string,
  ) {
    return this.aiService.createAITask(
      req.user.userId,
      organizationId || null,
      type,
      inputParams,
      productId,
    );
  }

  @Get('forecast/demand/:productId')
  @ApiOperation({ summary: 'Получить прогноз спроса для товара' })
  getDemandForecast(
    @Request() req,
    @Param('productId') productId: string,
    @Query('days') days?: number,
    @Query('organizationId') organizationId?: string,
  ) {
    return this.aiService.getDemandForecast(
      req.user.userId,
      organizationId || null,
      productId,
      days ? parseInt(days.toString()) : 30,
    );
  }

  @Get('recommendations/price/:productId')
  @ApiOperation({ summary: 'Получить рекомендацию по цене товара' })
  getPriceRecommendation(
    @Request() req,
    @Param('productId') productId: string,
    @Query('organizationId') organizationId?: string,
  ) {
    return this.aiService.getPriceRecommendation(
      req.user.userId,
      organizationId || null,
      productId,
    );
  }

  @Get('anomalies')
  @ApiOperation({ summary: 'Обнаружить аномалии в продажах' })
  detectAnomalies(
    @Request() req,
    @Query('organizationId') organizationId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.aiService.detectAnomalies(
      req.user.userId,
      organizationId || null,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
  }

  @Get('recommendations/assortment')
  @ApiOperation({ summary: 'Получить рекомендации по расширению ассортимента' })
  getAssortmentRecommendations(
    @Request() req,
    @Query('organizationId') organizationId?: string,
  ) {
    return this.aiService.getAssortmentRecommendations(
      req.user.userId,
      organizationId || null,
    );
  }

  @Get('segmentation/customers')
  @ApiOperation({ summary: 'Получить сегментацию клиентов' })
  getCustomerSegmentation(
    @Request() req,
    @Query('organizationId') organizationId?: string,
  ) {
    return this.aiService.getCustomerSegmentation(
      req.user.userId,
      organizationId || null,
    );
  }

  @Get('recommendations')
  @ApiOperation({ summary: 'Получить все AI рекомендации' })
  getRecommendations(
    @Request() req,
    @Query('organizationId') organizationId?: string,
    @Query('type') type?: RecommendationType,
    @Query('limit') limit?: number,
  ) {
    return this.aiService.getRecommendations(
      req.user.userId,
      organizationId || null,
      type,
      limit ? parseInt(limit.toString()) : 50,
    );
  }

  @Get('ltv')
  @ApiOperation({ summary: 'Рассчитать LTV (Lifetime Value) клиентов' })
  calculateLTV(
    @Request() req,
    @Query('organizationId') organizationId?: string,
  ) {
    return this.aiService.calculateLTV(
      req.user.userId,
      organizationId || null,
    );
  }

  @Get('churn')
  @ApiOperation({ summary: 'Прогноз оттока клиентов' })
  predictChurn(
    @Request() req,
    @Query('organizationId') organizationId?: string,
  ) {
    return this.aiService.predictChurn(
      req.user.userId,
      organizationId || null,
    );
  }

  @Get('retention')
  @ApiOperation({ summary: 'Получить рекомендации по удержанию клиентов' })
  getRetentionRecommendations(
    @Request() req,
    @Query('organizationId') organizationId?: string,
  ) {
    return this.aiService.getRetentionRecommendations(
      req.user.userId,
      organizationId || null,
    );
  }

  @Post('recommendations/:id/apply')
  @ApiOperation({ summary: 'Применить рекомендацию' })
  applyRecommendation(@Request() req, @Param('id') id: string) {
    // TODO: Реализовать применение рекомендации
    return { message: 'Recommendation applied', id };
  }
}

