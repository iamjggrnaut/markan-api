import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as CryptoJS from 'crypto-js';

@Injectable()
export class EncryptionService {
  private readonly encryptionKey: string;

  constructor(private configService: ConfigService) {
    this.encryptionKey =
      this.configService.get<string>('ENCRYPTION_KEY') ||
      'default-encryption-key-change-in-production';
  }

  encrypt(text: string): string {
    if (!text) {
      return text;
    }
    return CryptoJS.AES.encrypt(text, this.encryptionKey).toString();
  }

  decrypt(encryptedText: string): string {
    if (!encryptedText) {
      return encryptedText;
    }
    try {
      const bytes = CryptoJS.AES.decrypt(encryptedText, this.encryptionKey);
      return bytes.toString(CryptoJS.enc.Utf8);
    } catch (error) {
      throw new Error('Failed to decrypt data');
    }
  }

  encryptObject(obj: any): string {
    if (!obj) {
      return null;
    }
    const jsonString = JSON.stringify(obj);
    return this.encrypt(jsonString);
  }

  decryptObject(encryptedText: string): any {
    if (!encryptedText) {
      return null;
    }
    try {
      const decrypted = this.decrypt(encryptedText);
      return JSON.parse(decrypted);
    } catch (error) {
      throw new Error('Failed to decrypt object');
    }
  }
}

