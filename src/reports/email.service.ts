import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { Report } from './report.entity';
import * as fs from 'fs';

@Injectable()
export class EmailService {
  private transporter: nodemailer.Transporter;

  constructor(private configService: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.configService.get<string>('SMTP_HOST') || 'smtp.gmail.com',
      port: this.configService.get<number>('SMTP_PORT') || 587,
      secure: false,
      auth: {
        user: this.configService.get<string>('SMTP_USER'),
        pass: this.configService.get<string>('SMTP_PASS'),
      },
    });
  }

  async sendReport(
    recipients: string[],
    report: Report,
    userEmail: string,
  ): Promise<void> {
    const attachments = [];

    if (report.filePath && fs.existsSync(report.filePath)) {
      attachments.push({
        filename: report.fileName,
        path: report.filePath,
      });
    }

    const mailOptions = {
      from: this.configService.get<string>('SMTP_FROM') || userEmail,
      to: recipients.join(', '),
      subject: `Отчет: ${report.title}`,
      html: this.getReportEmailTemplate(report),
      attachments,
    };

    await this.transporter.sendMail(mailOptions);
  }

  private getReportEmailTemplate(report: Report): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #3b82f6; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background-color: #f8f9fa; }
          .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${report.title}</h1>
          </div>
          <div class="content">
            <p>${report.description || 'Ваш отчет готов и прикреплен к письму.'}</p>
            <p><strong>Тип:</strong> ${report.type}</p>
            <p><strong>Формат:</strong> ${report.format}</p>
            <p><strong>Дата генерации:</strong> ${report.generatedAt?.toLocaleString('ru-RU') || 'Не указана'}</p>
            ${report.fileSize ? `<p><strong>Размер файла:</strong> ${(report.fileSize / 1024).toFixed(2)} KB</p>` : ''}
          </div>
          <div class="footer">
            <p>Это автоматическое сообщение от Nebula Markan</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  async sendNotification(
    recipient: string,
    subject: string,
    message: string,
  ): Promise<void> {
    const mailOptions = {
      from: this.configService.get<string>('SMTP_FROM'),
      to: recipient,
      subject,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          </style>
        </head>
        <body>
          <div class="container">
            <h2>${subject}</h2>
            <p>${message}</p>
          </div>
        </body>
        </html>
      `,
    };

    await this.transporter.sendMail(mailOptions);
  }
}

