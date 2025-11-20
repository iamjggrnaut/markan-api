import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  UseGuards,
  Request,
  UseInterceptors,
  UploadedFile,
  Res,
  Query,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../admin/guards/admin.guard';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { PaymentStatus } from './payment.entity';
import { Response } from 'express';
import * as fs from 'fs';

@ApiTags('Payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Создать новый платеж' })
  async createPayment(@Request() req, @Body() dto: CreatePaymentDto) {
    return await this.paymentsService.createPayment(
      req.user.userId,
      dto.planType,
      dto.billingPeriod,
      dto.provider,
    );
  }

  @Post('webhook/yookassa')
  @ApiOperation({ summary: 'Webhook от ЮКассы для обработки платежей' })
  async yooKassaWebhook(@Body() webhookData: any) {
    return await this.paymentsService.processWebhook('yookassa', webhookData);
  }

  @Get('my')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Получить мои платежи' })
  async getMyPayments(@Request() req) {
    return await this.paymentsService.getUserPayments(req.user.userId);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Получить платеж по ID' })
  async getPayment(@Request() req, @Param('id') id: string) {
    return await this.paymentsService.getPaymentById(id, req.user.userId);
  }

  @Post(':id/receipt')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiOperation({ summary: 'Загрузить квитанцию об оплате' })
  async uploadReceipt(
    @Request() req,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new Error('Файл не загружен');
    }

    // Проверяем тип файла (только изображения и PDF)
    const allowedMimeTypes = [
      'image/jpeg',
      'image/png',
      'image/jpg',
      'application/pdf',
    ];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new Error('Недопустимый тип файла. Разрешены только изображения и PDF');
    }

    // Проверяем размер файла (максимум 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      throw new Error('Размер файла превышает 10MB');
    }

    return await this.paymentsService.uploadReceipt(id, req.user.userId, file);
  }

  @Get(':id/receipt')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Скачать квитанцию об оплате' })
  async downloadReceipt(
    @Request() req,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const payment = await this.paymentsService.getPaymentById(id, req.user.userId);
    const filePath = this.paymentsService.getReceiptFilePath(payment);

    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(404).json({ message: 'Файл квитанции не найден' });
    }

    return res.download(filePath, payment.receiptFileName || 'receipt');
  }

  // Админские эндпоинты
  @Get('admin/all')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Получить все платежи (админ)' })
  async getAllPayments(
    @Query('status') status?: PaymentStatus,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    return await this.paymentsService.getAllPayments(status, limit, offset);
  }

  @Put('admin/:id/approve')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Подтвердить платеж (админ)' })
  async approvePayment(
    @Param('id') id: string,
    @Body() body: { adminNotes?: string },
  ) {
    return await this.paymentsService.approvePayment(id, body.adminNotes);
  }

  @Put('admin/:id/reject')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Отклонить платеж (админ)' })
  async rejectPayment(
    @Param('id') id: string,
    @Body() body: { adminNotes: string },
  ) {
    return await this.paymentsService.rejectPayment(id, body.adminNotes);
  }

  @Get('admin/:id/receipt')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Скачать квитанцию (админ)' })
  async downloadReceiptAdmin(
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const payment = await this.paymentsService.getPaymentById(id);
    const filePath = this.paymentsService.getReceiptFilePath(payment);

    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(404).json({ message: 'Файл квитанции не найден' });
    }

    return res.download(filePath, payment.receiptFileName || 'receipt');
  }
}

