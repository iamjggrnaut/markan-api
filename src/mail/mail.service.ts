import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { Transporter } from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter;

  constructor(private configService: ConfigService) {
    this.initializeTransporter();
  }

  private initializeTransporter() {
    const mailConfig = {
      host: this.configService.get<string>('SMTP_HOST') || 'smtp.gmail.com',
      port: parseInt(this.configService.get<string>('SMTP_PORT') || '587'),
      secure: this.configService.get<string>('SMTP_SECURE') === 'true', // true for 465, false for other ports
      auth: {
        user: this.configService.get<string>('SMTP_USER'),
        pass: this.configService.get<string>('SMTP_PASSWORD'),
      },
    };

    // Если нет конфигурации SMTP, используем тестовый транспортер (для разработки)
    if (!mailConfig.auth.user || !mailConfig.auth.pass) {
      this.logger.warn('SMTP credentials not configured. Using test transporter.');
      this.transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: {
          user: 'test@ethereal.email',
          pass: 'test',
        },
      });
    } else {
      this.transporter = nodemailer.createTransport(mailConfig);
    }

    // Проверяем подключение
    this.transporter.verify((error) => {
      if (error) {
        this.logger.error('SMTP connection error:', error);
      } else {
        this.logger.log('SMTP server is ready to send emails');
      }
    });
  }

  async sendPasswordResetEmail(email: string, resetToken: string): Promise<void> {
    const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';
    const resetLink = `${frontendUrl}/reset-password?token=${resetToken}`;

    const mailOptions = {
      from: this.configService.get<string>('SMTP_FROM') || `"Nebula Markan" <${this.configService.get<string>('SMTP_USER')}>`,
      to: email,
      subject: 'Восстановление пароля - Nebula Markan',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
            .warning { background: #fff3cd; border-left: 4px solid #ffc107; padding: 10px; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Nebula Markan</h1>
            </div>
            <div class="content">
              <h2>Восстановление пароля</h2>
              <p>Вы запросили восстановление пароля для вашего аккаунта.</p>
              <p>Нажмите на кнопку ниже, чтобы установить новый пароль:</p>
              <p style="text-align: center;">
                <a href="${resetLink}" class="button">Восстановить пароль</a>
              </p>
              <p>Или скопируйте и вставьте эту ссылку в браузер:</p>
              <p style="word-break: break-all; color: #667eea;">${resetLink}</p>
              <div class="warning">
                <strong>⚠️ Внимание:</strong> Ссылка действительна в течение 1 часа. Если вы не запрашивали восстановление пароля, проигнорируйте это письмо.
              </div>
            </div>
            <div class="footer">
              <p>Это автоматическое письмо, пожалуйста, не отвечайте на него.</p>
              <p>&copy; ${new Date().getFullYear()} Nebula Markan. Все права защищены.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
        Восстановление пароля - Nebula Markan
        
        Вы запросили восстановление пароля для вашего аккаунта.
        
        Перейдите по ссылке для установки нового пароля:
        ${resetLink}
        
        Ссылка действительна в течение 1 часа.
        
        Если вы не запрашивали восстановление пароля, проигнорируйте это письмо.
      `,
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      this.logger.log(`Password reset email sent to ${email}. MessageId: ${info.messageId}`);
      
      // В development режиме выводим ссылку в консоль
      if (this.configService.get<string>('NODE_ENV') === 'development') {
        this.logger.log(`Password reset link: ${resetLink}`);
      }
    } catch (error) {
      this.logger.error(`Failed to send password reset email to ${email}:`, error);
      throw error;
    }
  }

  async sendWelcomeEmail(email: string, firstName?: string): Promise<void> {
    const mailOptions = {
      from: this.configService.get<string>('SMTP_FROM') || `"Nebula Markan" <${this.configService.get<string>('SMTP_USER')}>`,
      to: email,
      subject: 'Добро пожаловать в Nebula Markan!',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Добро пожаловать в Nebula Markan!</h1>
            </div>
            <div class="content">
              <h2>Привет, ${firstName || 'друг'}! 👋</h2>
              <p>Спасибо за регистрацию в Nebula Markan - аналитическом сервисе для маркетплейсов.</p>
              <p>Теперь вы можете:</p>
              <ul>
                <li>Подключить свои аккаунты маркетплейсов</li>
                <li>Анализировать продажи в реальном времени</li>
                <li>Получать AI рекомендации</li>
                <li>Создавать автоматические отчеты</li>
              </ul>
              <p style="text-align: center;">
                <a href="${this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000'}/dashboard" class="button">Начать работу</a>
              </p>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} Nebula Markan. Все права защищены.</p>
            </div>
          </div>
        </body>
        </html>
      `,
    };

    try {
      await this.transporter.sendMail(mailOptions);
      this.logger.log(`Welcome email sent to ${email}`);
    } catch (error) {
      this.logger.error(`Failed to send welcome email to ${email}:`, error);
      // Не бросаем ошибку для welcome email, так как это не критично
    }
  }

  async sendNotificationEmail(
    email: string,
    subject: string,
    message: string,
    actionUrl?: string,
    actionText?: string,
  ): Promise<void> {
    const mailOptions = {
      from: this.configService.get<string>('SMTP_FROM') || `"Nebula Markan" <${this.configService.get<string>('SMTP_USER')}>`,
      to: email,
      subject,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Nebula Markan</h1>
            </div>
            <div class="content">
              <h2>${subject}</h2>
              <div>${message}</div>
              ${actionUrl && actionText ? `<p style="text-align: center;"><a href="${actionUrl}" class="button">${actionText}</a></p>` : ''}
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} Nebula Markan. Все права защищены.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: message,
    };

    try {
      await this.transporter.sendMail(mailOptions);
      this.logger.log(`Notification email sent to ${email}: ${subject}`);
    } catch (error) {
      this.logger.error(`Failed to send notification email to ${email}:`, error);
      throw error;
    }
  }
}

