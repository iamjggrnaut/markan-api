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
import { CustomersService } from './customers.service';
import { CreateSegmentDto } from './dto/create-segment.dto';
import { UpdateSegmentDto } from './dto/update-segment.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Customers')
@Controller('customers')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  // Сегменты
  @Post('segments')
  @ApiOperation({ summary: 'Создать сегмент клиентов' })
  createSegment(
    @Request() req,
    @Body() createDto: CreateSegmentDto,
    @Query('organizationId') organizationId?: string,
  ) {
    return this.customersService.createSegment(
      req.user.userId,
      organizationId || null,
      createDto,
    );
  }

  @Get('segments')
  @ApiOperation({ summary: 'Получить список сегментов' })
  findAllSegments(
    @Request() req,
    @Query('organizationId') organizationId?: string,
  ) {
    return this.customersService.findAllSegments(
      req.user.userId,
      organizationId || null,
    );
  }

  @Get('segments/:id')
  @ApiOperation({ summary: 'Получить сегмент' })
  findOneSegment(@Request() req, @Param('id') id: string) {
    return this.customersService.findOneSegment(id, req.user.userId);
  }

  @Get('segments/:id/members')
  @ApiOperation({ summary: 'Получить клиентов сегмента' })
  getSegmentMembers(
    @Request() req,
    @Param('id') id: string,
    @Query('limit') limit?: number,
  ) {
    return this.customersService.getSegmentMembers(
      id,
      req.user.userId,
      limit ? parseInt(limit.toString()) : 100,
    );
  }

  @Patch('segments/:id')
  @ApiOperation({ summary: 'Обновить сегмент' })
  updateSegment(
    @Request() req,
    @Param('id') id: string,
    @Body() updateDto: UpdateSegmentDto,
  ) {
    return this.customersService.updateSegment(id, req.user.userId, updateDto);
  }

  @Post('segments/:id/recalculate')
  @ApiOperation({ summary: 'Пересчитать клиентов сегмента' })
  recalculateSegment(
    @Request() req,
    @Param('id') id: string,
    @Query('organizationId') organizationId?: string,
  ) {
    return this.customersService.calculateSegmentMembers(
      id,
      req.user.userId,
      organizationId || null,
    );
  }

  @Delete('segments/:id')
  @ApiOperation({ summary: 'Удалить сегмент' })
  deleteSegment(@Request() req, @Param('id') id: string) {
    return this.customersService.deleteSegment(id, req.user.userId);
  }

  // Аналитика
  @Get('repeat-purchase')
  @ApiOperation({ summary: 'Анализ повторных покупок' })
  getRepeatPurchaseAnalysis(
    @Request() req,
    @Query('organizationId') organizationId?: string,
    @Query('days') days?: number,
  ) {
    return this.customersService.getRepeatPurchaseAnalysis(
      req.user.userId,
      organizationId || null,
      days ? parseInt(days.toString()) : 90,
    );
  }

  @Get('funnel')
  @ApiOperation({ summary: 'Воронка продаж' })
  getSalesFunnel(
    @Request() req,
    @Query('organizationId') organizationId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.customersService.getSalesFunnel(
      req.user.userId,
      organizationId || null,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
  }

  @Get('recommendations/:customerId')
  @ApiOperation({ summary: 'Персонализированные рекомендации для клиента' })
  getPersonalizedRecommendations(
    @Request() req,
    @Param('customerId') customerId: string,
    @Query('organizationId') organizationId?: string,
  ) {
    return this.customersService.getPersonalizedRecommendations(
      req.user.userId,
      organizationId || null,
      customerId,
    );
  }
}

