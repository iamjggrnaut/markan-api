import { Injectable } from '@nestjs/common';
import * as DOMPurify from 'isomorphic-dompurify';

@Injectable()
export class SecurityService {
  /**
   * Санитизация HTML для защиты от XSS
   */
  sanitizeHtml(html: string): string {
    return DOMPurify.sanitize(html, {
      ALLOWED_TAGS: [],
      ALLOWED_ATTR: [],
    });
  }

  /**
   * Санитизация текста (удаление потенциально опасных символов)
   */
  sanitizeText(text: string): string {
    if (!text) return '';
    return text
      .replace(/<[^>]*>/g, '') // Удаляем HTML теги
      .replace(/[<>]/g, '') // Удаляем угловые скобки
      .trim();
  }

  /**
   * Валидация email
   */
  isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Валидация UUID
   */
  isValidUUID(uuid: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  }

  /**
   * Экранирование специальных символов для SQL LIKE запросов
   */
  escapeLikePattern(pattern: string): string {
    return pattern.replace(/[%_\\]/g, '\\$&');
  }

  /**
   * Валидация и санитизация строки поиска
   */
  sanitizeSearchQuery(query: string): string {
    if (!query) return '';
    // Удаляем опасные символы, оставляем только буквы, цифры, пробелы и некоторые символы
    return query
      .replace(/[<>'"\\]/g, '')
      .trim()
      .substring(0, 100); // Ограничение длины
  }
}

