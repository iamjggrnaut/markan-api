import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
  Request,
  Query,
  Res,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { Response } from 'express';
import { ReportsService } from './reports.service';
import { ReportType, ReportFormat } from './report.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import * as fs from 'fs';

@ApiTags('Reports')
@Controller('reports')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Post('generate')
  @ApiOperation({ summary: 'Сгенерировать отчет' })
  generateReport(
    @Request() req,
    @Body('type') type: ReportType,
    @Body('format') format: ReportFormat,
    @Body('parameters') parameters: any,
    @Query('organizationId') organizationId?: string,
  ) {
    return this.reportsService.generateReport(
      req.user.userId,
      organizationId || null,
      type,
      format,
      parameters || {},
    );
  }

  @Get()
  @ApiOperation({ summary: 'Получить список отчетов' })
  getReports(
    @Request() req,
    @Query('organizationId') organizationId?: string,
    @Query('type') type?: ReportType,
    @Query('limit') limit?: number,
  ) {
    return this.reportsService.getReports(
      req.user.userId,
      organizationId || null,
      type,
      limit ? parseInt(limit.toString()) : 50,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Получить отчет' })
  getReport(@Request() req, @Param('id') id: string) {
    return this.reportsService.getReport(id, req.user.userId);
  }

  @Get(':id/download')
  @ApiOperation({ summary: 'Скачать отчет' })
  async downloadReport(
    @Request() req,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const report = await this.reportsService.getReport(id, req.user.userId);

    if (!report.filePath || !fs.existsSync(report.filePath)) {
      return res.status(404).json({ message: 'Report file not found' });
    }

    res.setHeader(
      'Content-Type',
      this.getContentType(report.format),
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${report.fileName}"`,
    );

    const fileStream = fs.createReadStream(report.filePath);
    fileStream.pipe(res);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Удалить отчет' })
  deleteReport(@Request() req, @Param('id') id: string) {
    return this.reportsService.deleteReport(id, req.user.userId);
  }

  @Post('schedules')
  @ApiOperation({ summary: 'Создать расписание отчетов' })
  createSchedule(
    @Request() req,
    @Body() scheduleData: any,
    @Query('organizationId') organizationId?: string,
  ) {
    return this.reportsService.createSchedule(
      req.user.userId,
      organizationId || null,
      scheduleData,
    );
  }

  @Get('schedules')
  @ApiOperation({ summary: 'Получить расписания отчетов' })
  getSchedules(
    @Request() req,
    @Query('organizationId') organizationId?: string,
  ) {
    return this.reportsService.getSchedules(
      req.user.userId,
      organizationId || null,
    );
  }

  private getContentType(format: ReportFormat): string {
    const contentTypes = {
      [ReportFormat.EXCEL]: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      [ReportFormat.PDF]: 'application/pdf',
      [ReportFormat.CSV]: 'text/csv',
      [ReportFormat.JSON]: 'application/json',
    };

    return contentTypes[format] || 'application/octet-stream';
  }
}

