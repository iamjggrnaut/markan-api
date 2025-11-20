import { Injectable, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { Report, ReportType, ReportFormat, ReportStatus } from './report.entity';
import { ReportSchedule, ScheduleFrequency } from './report-schedule.entity';
import { AnalyticsService } from '../analytics/analytics.service';
import { ProductsService } from '../products/products.service';
import { GeoService } from '../geo/geo.service';
import { EmailService } from './email.service';
import * as ExcelJS from 'exceljs';
import * as PDFDocument from 'pdfkit';
import * as csvWriter from 'csv-writer';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class ReportsService {
  private readonly reportsDir = path.join(process.cwd(), 'reports');

  constructor(
    @InjectRepository(Report)
    private reportsRepository: Repository<Report>,
    @InjectRepository(ReportSchedule)
    private schedulesRepository: Repository<ReportSchedule>,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private analyticsService: AnalyticsService,
    private productsService: ProductsService,
    private geoService: GeoService,
    private emailService: EmailService,
  ) {
    // Создаем директорию для отчетов
    if (!fs.existsSync(this.reportsDir)) {
      fs.mkdirSync(this.reportsDir, { recursive: true });
    }
  }

  async generateReport(
    userId: string,
    organizationId: string | null,
    type: ReportType,
    format: ReportFormat,
    parameters: any,
  ): Promise<Report> {
    const report = this.reportsRepository.create({
      user: { id: userId } as any,
      organization: organizationId ? ({ id: organizationId } as any) : null,
      type,
      format,
      title: this.getReportTitle(type, parameters),
      description: this.getReportDescription(type),
      status: ReportStatus.GENERATING,
      parameters,
    });

    const savedReport = await this.reportsRepository.save(report);

    try {
      let filePath: string;
      let fileName: string;

      switch (format) {
        case ReportFormat.EXCEL:
          const excelResult = await this.generateExcelReport(
            userId,
            organizationId,
            type,
            parameters,
          );
          filePath = excelResult.filePath;
          fileName = excelResult.fileName;
          break;

        case ReportFormat.PDF:
          const pdfResult = await this.generatePDFReport(
            userId,
            organizationId,
            type,
            parameters,
          );
          filePath = pdfResult.filePath;
          fileName = pdfResult.fileName;
          break;

        case ReportFormat.CSV:
          const csvResult = await this.generateCSVReport(
            userId,
            organizationId,
            type,
            parameters,
          );
          filePath = csvResult.filePath;
          fileName = csvResult.fileName;
          break;

        case ReportFormat.JSON:
          const jsonResult = await this.generateJSONReport(
            userId,
            organizationId,
            type,
            parameters,
          );
          filePath = jsonResult.filePath;
          fileName = jsonResult.fileName;
          break;
      }

      const stats = fs.statSync(filePath);

      savedReport.status = ReportStatus.COMPLETED;
      savedReport.filePath = filePath;
      savedReport.fileName = fileName;
      savedReport.fileSize = stats.size;
      savedReport.generatedAt = new Date();

      await this.reportsRepository.save(savedReport);
      return savedReport;
    } catch (error) {
      savedReport.status = ReportStatus.FAILED;
      savedReport.error = error.message;
      await this.reportsRepository.save(savedReport);
      throw error;
    }
  }

  private async generateExcelReport(
    userId: string,
    organizationId: string | null,
    type: ReportType,
    parameters: any,
  ): Promise<{ filePath: string; fileName: string }> {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Отчет');

    // Заголовки
    worksheet.columns = [
      { header: 'Дата', key: 'date', width: 15 },
      { header: 'Выручка', key: 'revenue', width: 15 },
      { header: 'Прибыль', key: 'profit', width: 15 },
      { header: 'Заказов', key: 'orders', width: 12 },
      { header: 'Средний чек', key: 'avgOrder', width: 15 },
    ];

    // Получаем данные
    const startDate = parameters.startDate
      ? new Date(parameters.startDate)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endDate = parameters.endDate ? new Date(parameters.endDate) : new Date();

    const stats = await this.analyticsService.getDashboardStats(
      userId,
      organizationId,
      startDate,
      endDate,
    );

    // Добавляем данные
    stats.salesByPeriod.forEach((period) => {
      worksheet.addRow({
        date: period.date,
        revenue: period.revenue,
        profit: stats.totalProfit * (period.revenue / stats.totalRevenue),
        orders: period.orders,
        avgOrder: period.orders > 0 ? period.revenue / period.orders : 0,
      });
    });

    // Стилизация
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' },
    };

    const fileName = `report_${type}_${Date.now()}.xlsx`;
    const filePath = path.join(this.reportsDir, fileName);

    await workbook.xlsx.writeFile(filePath);

    return { filePath, fileName };
  }

  private async generatePDFReport(
    userId: string,
    organizationId: string | null,
    type: ReportType,
    parameters: any,
  ): Promise<{ filePath: string; fileName: string }> {
    const fileName = `report_${type}_${Date.now()}.pdf`;
    const filePath = path.join(this.reportsDir, fileName);

    const doc = new PDFDocument();
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    // Заголовок
    doc.fontSize(20).text('Отчет по продажам', { align: 'center' });
    doc.moveDown();

    // Получаем данные
    const startDate = parameters.startDate
      ? new Date(parameters.startDate)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endDate = parameters.endDate ? new Date(parameters.endDate) : new Date();

    const stats = await this.analyticsService.getDashboardStats(
      userId,
      organizationId,
      startDate,
      endDate,
    );

    // Данные
    doc.fontSize(14).text('Общая статистика:', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(12).text(`Выручка: ${stats.totalRevenue.toFixed(2)} ₽`);
    doc.text(`Прибыль: ${stats.totalProfit.toFixed(2)} ₽`);
    doc.text(`Заказов: ${stats.totalSales}`);
    doc.text(`Средний чек: ${stats.averageOrderValue.toFixed(2)} ₽`);
    doc.moveDown();

    // Топ товары
    if (stats.topProducts.length > 0) {
      doc.fontSize(14).text('Топ товары:', { underline: true });
      doc.moveDown(0.5);
      stats.topProducts.slice(0, 10).forEach((product, index) => {
        doc.fontSize(10).text(
          `${index + 1}. ${product.product.name} - ${product.revenue.toFixed(2)} ₽`,
        );
      });
    }

    doc.end();

    return new Promise((resolve, reject) => {
      stream.on('finish', () => resolve({ filePath, fileName }));
      stream.on('error', reject);
    });
  }

  private async generateCSVReport(
    userId: string,
    organizationId: string | null,
    type: ReportType,
    parameters: any,
  ): Promise<{ filePath: string; fileName: string }> {
    const fileName = `report_${type}_${Date.now()}.csv`;
    const filePath = path.join(this.reportsDir, fileName);

    const startDate = parameters.startDate
      ? new Date(parameters.startDate)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endDate = parameters.endDate ? new Date(parameters.endDate) : new Date();

    const stats = await this.analyticsService.getDashboardStats(
      userId,
      organizationId,
      startDate,
      endDate,
    );

    const csv = csvWriter.createObjectCsvWriter({
      path: filePath,
      header: [
        { id: 'date', title: 'Дата' },
        { id: 'revenue', title: 'Выручка' },
        { id: 'orders', title: 'Заказов' },
        { id: 'avgOrder', title: 'Средний чек' },
      ],
    });

    const records = stats.salesByPeriod.map((period) => ({
      date: period.date,
      revenue: period.revenue.toFixed(2),
      orders: period.orders,
      avgOrder:
        period.orders > 0 ? (period.revenue / period.orders).toFixed(2) : '0',
    }));

    await csv.writeRecords(records);

    return { filePath, fileName };
  }

  private async generateJSONReport(
    userId: string,
    organizationId: string | null,
    type: ReportType,
    parameters: any,
  ): Promise<{ filePath: string; fileName: string }> {
    const fileName = `report_${type}_${Date.now()}.json`;
    const filePath = path.join(this.reportsDir, fileName);

    const startDate = parameters.startDate
      ? new Date(parameters.startDate)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endDate = parameters.endDate ? new Date(parameters.endDate) : new Date();

    const stats = await this.analyticsService.getDashboardStats(
      userId,
      organizationId,
      startDate,
      endDate,
    );

    const data = {
      type,
      period: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      },
      stats,
      generatedAt: new Date().toISOString(),
    };

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));

    return { filePath, fileName };
  }

  async getReports(
    userId: string,
    organizationId: string | null,
    type?: ReportType,
    limit: number = 50,
  ): Promise<Report[]> {
    const where: any = { user: { id: userId } };
    if (organizationId) {
      where.organization = { id: organizationId };
    }
    if (type) {
      where.type = type;
    }

    return this.reportsRepository.find({
      where,
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  async getReport(id: string, userId: string): Promise<Report> {
    const report = await this.reportsRepository.findOne({
      where: { id, user: { id: userId } },
    });

    if (!report) {
      throw new Error(`Report with ID ${id} not found`);
    }

    return report;
  }

  async deleteReport(id: string, userId: string): Promise<void> {
    const report = await this.getReport(id, userId);

    // Удаляем файл
    if (report.filePath && fs.existsSync(report.filePath)) {
      fs.unlinkSync(report.filePath);
    }

    await this.reportsRepository.remove(report);
  }

  async createSchedule(
    userId: string,
    organizationId: string | null,
    scheduleData: any,
  ): Promise<ReportSchedule> {
    const schedule = this.schedulesRepository.create({
      ...scheduleData,
      user: { id: userId } as any,
      organization: organizationId ? ({ id: organizationId } as any) : null,
    }) as unknown as ReportSchedule;

    // Вычисляем следующий запуск
    schedule.nextRunAt = this.calculateNextRun(schedule);

    return this.schedulesRepository.save(schedule);
  }

  async getSchedules(
    userId: string,
    organizationId: string | null,
  ): Promise<ReportSchedule[]> {
    const where: any = { user: { id: userId } };
    if (organizationId) {
      where.organization = { id: organizationId };
    }

    return this.schedulesRepository.find({
      where,
      order: { createdAt: 'DESC' },
    });
  }

  private getReportTitle(type: ReportType, parameters: any): string {
    const titles = {
      [ReportType.DAILY]: 'Ежедневный отчет',
      [ReportType.WEEKLY]: 'Еженедельный отчет',
      [ReportType.MONTHLY]: 'Ежемесячный отчет',
      [ReportType.CUSTOM]: 'Кастомный отчет',
    };

    return titles[type] || 'Отчет';
  }

  private getReportDescription(type: ReportType): string {
    const descriptions = {
      [ReportType.DAILY]: 'Ежедневная сводка по продажам и метрикам',
      [ReportType.WEEKLY]: 'Еженедельная аналитика и тренды',
      [ReportType.MONTHLY]: 'Ежемесячный обзор бизнес-показателей',
      [ReportType.CUSTOM]: 'Пользовательский отчет',
    };

    return descriptions[type] || 'Отчет';
  }

  private calculateNextRun(schedule: ReportSchedule): Date {
    const now = new Date();
    const next = new Date(now);

    switch (schedule.frequency) {
      case ScheduleFrequency.DAILY:
        if (schedule.time) {
          const [hours, minutes] = schedule.time.split(':');
          next.setHours(parseInt(hours), parseInt(minutes), 0, 0);
          if (next <= now) {
            next.setDate(next.getDate() + 1);
          }
        } else {
          next.setDate(next.getDate() + 1);
        }
        break;

      case ScheduleFrequency.WEEKLY:
        if (schedule.dayOfWeek !== null && schedule.dayOfWeek !== undefined) {
          const daysUntilNext = (schedule.dayOfWeek - next.getDay() + 7) % 7;
          next.setDate(next.getDate() + (daysUntilNext || 7));
          if (schedule.time) {
            const [hours, minutes] = schedule.time.split(':');
            next.setHours(parseInt(hours), parseInt(minutes), 0, 0);
          }
        }
        break;

      case ScheduleFrequency.MONTHLY:
        if (schedule.dayOfMonth) {
          next.setMonth(next.getMonth() + 1);
          next.setDate(schedule.dayOfMonth);
          if (schedule.time) {
            const [hours, minutes] = schedule.time.split(':');
            next.setHours(parseInt(hours), parseInt(minutes), 0, 0);
          }
        }
        break;
    }

    return next;
  }

  async sendScheduledReport(scheduleId: string): Promise<void> {
    const schedule = await this.schedulesRepository.findOne({
      where: { id: scheduleId },
      relations: ['user'],
    });

    if (!schedule || !schedule.isActive) {
      return;
    }

    const report = await this.generateReport(
      schedule.user.id,
      schedule.organization?.id || null,
      schedule.reportType,
      schedule.format,
      schedule.parameters || {},
    );

    report.isScheduled = true;
    await this.reportsRepository.save(report);

    // Отправляем email
    if (schedule.recipients && schedule.recipients.length > 0) {
      await this.emailService.sendReport(
        schedule.recipients,
        report,
        schedule.user.email || '',
      );
    }

    // Обновляем расписание
    schedule.lastRunAt = new Date();
    schedule.nextRunAt = this.calculateNextRun(schedule);
    await this.schedulesRepository.save(schedule);
  }
}

