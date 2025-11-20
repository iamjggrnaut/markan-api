import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AnalyticsService } from './analytics.service';

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  },
  namespace: '/analytics',
})
export class AnalyticsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private connectedClients = new Map<string, { 
    userId: string; 
    socket: Socket; 
    connectedAt: Date;
    lastActivity: Date;
  }>();

  constructor(
    private analyticsService: AnalyticsService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token || client.handshake.headers?.authorization?.replace('Bearer ', '');
      
      if (!token) {
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token, {
        secret: this.configService.get<string>('JWT_SECRET'),
      });

      this.connectedClients.set(client.id, {
        userId: payload.sub,
        socket: client,
        connectedAt: new Date(),
        lastActivity: new Date(),
      });

      client.join(`user:${payload.sub}`);
      console.log(`Client connected: ${client.id}, User: ${payload.sub}`);
    } catch (error) {
      console.error('WebSocket connection error:', error);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.connectedClients.delete(client.id);
    console.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('subscribe:dashboard')
  async handleSubscribeDashboard(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { organizationId?: string },
  ) {
    const clientData = this.connectedClients.get(client.id);
    if (!clientData) {
      return { error: 'Unauthorized' };
    }

    const room = data.organizationId
      ? `dashboard:${clientData.userId}:${data.organizationId}`
      : `dashboard:${clientData.userId}`;

    client.join(room);
    
    // Обновляем активность
    if (clientData) {
      clientData.lastActivity = new Date();
    }
    
    return { success: true, room };
  }

  @SubscribeMessage('unsubscribe:dashboard')
  async handleUnsubscribeDashboard(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { organizationId?: string },
  ) {
    const clientData = this.connectedClients.get(client.id);
    if (!clientData) {
      return { error: 'Unauthorized' };
    }

    const room = data.organizationId
      ? `dashboard:${clientData.userId}:${data.organizationId}`
      : `dashboard:${clientData.userId}`;

    client.leave(room);
    return { success: true };
  }

  // Метод для отправки обновлений всем подписанным клиентам
  async broadcastDashboardUpdate(
    userId: string,
    organizationId: string | null,
    data: any,
  ) {
    const room = organizationId
      ? `dashboard:${userId}:${organizationId}`
      : `dashboard:${userId}`;

    this.server.to(room).emit('dashboard:update', data);
  }

  // Метод для отправки обновлений конкретному пользователю
  async sendToUser(userId: string, event: string, data: any) {
    this.server.to(`user:${userId}`).emit(event, data);
  }

  // Получить статистику подключений
  getConnectionStats() {
    const stats = {
      totalConnections: this.connectedClients.size,
      users: new Set<string>(),
      connectionsByUser: new Map<string, number>(),
    };

    this.connectedClients.forEach((client) => {
      stats.users.add(client.userId);
      const count = stats.connectionsByUser.get(client.userId) || 0;
      stats.connectionsByUser.set(client.userId, count + 1);
    });

    return {
      ...stats,
      uniqueUsers: stats.users.size,
    };
  }

  // Закрыть неактивные соединения
  closeInactiveConnections(timeoutMs: number = 300000) { // 5 минут по умолчанию
    const now = new Date();
    const toClose: string[] = [];

    this.connectedClients.forEach((client, socketId) => {
      const inactiveTime = now.getTime() - client.lastActivity.getTime();
      if (inactiveTime > timeoutMs) {
        toClose.push(socketId);
      }
    });

    toClose.forEach((socketId) => {
      const client = this.connectedClients.get(socketId);
      if (client) {
        client.socket.disconnect();
        this.connectedClients.delete(socketId);
      }
    });

    return toClose.length;
  }
}

