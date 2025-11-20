import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DashboardWidget, WidgetType } from './dashboard-widget.entity';
import { CreateWidgetDto } from './dto/create-widget.dto';
import { UpdateWidgetDto } from './dto/update-widget.dto';

@Injectable()
export class DashboardWidgetsService {
  constructor(
    @InjectRepository(DashboardWidget)
    private widgetsRepository: Repository<DashboardWidget>,
  ) {}

  async getWidgets(
    userId: string,
    organizationId: string | null,
  ): Promise<DashboardWidget[]> {
    const where: any = { user: { id: userId }, isVisible: true };
    if (organizationId) {
      where.organization = { id: organizationId };
    }

    return this.widgetsRepository.find({
      where,
      order: { sortOrder: 'ASC', position: 'ASC' },
    });
  }

  async createWidget(
    userId: string,
    organizationId: string | null,
    createDto: CreateWidgetDto,
  ): Promise<DashboardWidget> {
    // Проверяем, нет ли уже виджета такого типа
    const existing = await this.widgetsRepository.findOne({
      where: {
        user: { id: userId },
        organization: organizationId ? { id: organizationId } : null,
        type: createDto.type,
      },
    });

    if (existing) {
      throw new BadRequestException(
        `Widget of type ${createDto.type} already exists`,
      );
    }

    // Определяем следующую позицию
    const maxPosition = await this.widgetsRepository
      .createQueryBuilder('widget')
      .where('widget.user.id = :userId', { userId })
      .andWhere(
        organizationId
          ? 'widget.organization.id = :organizationId'
          : 'widget.organization IS NULL',
        organizationId ? { organizationId } : {},
      )
      .select('MAX(widget.position)', 'max')
      .getRawOne();

    const widget = this.widgetsRepository.create({
      ...createDto,
      user: { id: userId } as any,
      organization: organizationId ? ({ id: organizationId } as any) : null,
      position: (maxPosition?.max || 0) + 1,
    });

    return this.widgetsRepository.save(widget);
  }

  async updateWidget(
    id: string,
    userId: string,
    updateDto: UpdateWidgetDto,
  ): Promise<DashboardWidget> {
    const widget = await this.widgetsRepository.findOne({
      where: { id, user: { id: userId } },
    });

    if (!widget) {
      throw new NotFoundException(`Widget with ID ${id} not found`);
    }

    Object.assign(widget, updateDto);
    return this.widgetsRepository.save(widget);
  }

  async deleteWidget(id: string, userId: string): Promise<void> {
    const widget = await this.widgetsRepository.findOne({
      where: { id, user: { id: userId } },
    });

    if (!widget) {
      throw new NotFoundException(`Widget with ID ${id} not found`);
    }

    await this.widgetsRepository.remove(widget);
  }

  async reorderWidgets(
    userId: string,
    organizationId: string | null,
    widgetIds: string[],
  ): Promise<void> {
    const widgets = await this.getWidgets(userId, organizationId);

    for (let i = 0; i < widgetIds.length; i++) {
      const widget = widgets.find((w) => w.id === widgetIds[i]);
      if (widget) {
        widget.sortOrder = i;
        widget.position = i;
        await this.widgetsRepository.save(widget);
      }
    }
  }

  async getDefaultWidgets(): Promise<Partial<DashboardWidget>[]> {
    return [
      {
        type: WidgetType.REVENUE,
        title: 'Выручка',
        width: 2,
        height: 1,
        isVisible: true,
      },
      {
        type: WidgetType.PROFIT,
        title: 'Прибыль',
        width: 2,
        height: 1,
        isVisible: true,
      },
      {
        type: WidgetType.ORDERS,
        title: 'Заказы',
        width: 2,
        height: 1,
        isVisible: true,
      },
      {
        type: WidgetType.AVERAGE_ORDER_VALUE,
        title: 'Средний чек',
        width: 2,
        height: 1,
        isVisible: true,
      },
      {
        type: WidgetType.SALES_CHART,
        title: 'Динамика продаж',
        width: 4,
        height: 2,
        isVisible: true,
      },
      {
        type: WidgetType.TOP_PRODUCTS,
        title: 'Топ товаров',
        width: 2,
        height: 2,
        isVisible: true,
      },
      {
        type: WidgetType.SALES_BY_MARKETPLACE,
        title: 'Продажи по маркетплейсам',
        width: 2,
        height: 2,
        isVisible: true,
      },
    ];
  }

  async initializeDefaultWidgets(
    userId: string,
    organizationId: string | null,
  ): Promise<DashboardWidget[]> {
    const defaultWidgets = await this.getDefaultWidgets();
    const createdWidgets: DashboardWidget[] = [];

    for (let i = 0; i < defaultWidgets.length; i++) {
      const widgetData = defaultWidgets[i];
      try {
        const widget = await this.createWidget(userId, organizationId, {
          ...widgetData,
          config: {},
        } as CreateWidgetDto);
        createdWidgets.push(widget);
      } catch (error) {
        // Пропускаем, если виджет уже существует
        continue;
      }
    }

    return createdWidgets;
  }
}

