import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { User } from '../users/user.entity';
import { UserActivity, ActivityType } from '../users/user-activity.entity';
import { MarketplaceAccount, AccountStatus } from '../integrations/marketplace-account.entity';
import { Product } from '../products/product.entity';
import { ProductSale } from '../products/product-sale.entity';
import { Organization } from '../organizations/organization.entity';

export interface AdminStats {
  totalUsers: number;
  activeUsers: number;
  newUsersToday: number;
  newUsersThisWeek: number;
  newUsersThisMonth: number;
  totalOrganizations: number;
  totalIntegrations: number;
  totalProducts: number;
  totalSales: number;
  totalRevenue: number;
  usersByPlan: Record<string, number>;
  recentActivity: UserActivity[];
}

export interface UserActivityStats {
  userId: string;
  userEmail: string;
  userName: string;
  loginCount: number;
  lastLoginAt: Date | null;
  totalActions: number;
  activities: UserActivity[];
}

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @InjectRepository(UserActivity)
    private activityRepository: Repository<UserActivity>,
    @InjectRepository(MarketplaceAccount)
    private accountsRepository: Repository<MarketplaceAccount>,
    @InjectRepository(Product)
    private productsRepository: Repository<Product>,
    @InjectRepository(ProductSale)
    private salesRepository: Repository<ProductSale>,
    @InjectRepository(Organization)
    private organizationsRepository: Repository<Organization>,
  ) {}

  async getStats(): Promise<AdminStats> {
    const now = new Date();
    const todayStart = new Date(now.setHours(0, 0, 0, 0));
    const weekStart = new Date(now.setDate(now.getDate() - 7));
    const monthStart = new Date(now.setMonth(now.getMonth() - 1));

    const [
      totalUsers,
      activeUsers,
      newUsersToday,
      newUsersThisWeek,
      newUsersThisMonth,
      totalOrganizations,
      totalIntegrations,
      totalProducts,
      sales,
      usersByPlan,
      recentActivity,
    ] = await Promise.all([
      this.usersRepository.count(),
      this.usersRepository.count({ where: { isActive: true } }),
      this.usersRepository.count({
        where: { createdAt: Between(todayStart, new Date()) },
      }),
      this.usersRepository.count({
        where: { createdAt: Between(weekStart, new Date()) },
      }),
      this.usersRepository.count({
        where: { createdAt: Between(monthStart, new Date()) },
      }),
      this.organizationsRepository.count(),
      this.accountsRepository.count({ where: { status: AccountStatus.ACTIVE } as any }),
      this.productsRepository.count(),
      this.salesRepository.find({
        select: ['quantity', 'totalAmount'],
      }),
      this.getUsersByPlan(),
      this.activityRepository.find({
        relations: ['user'],
        order: { createdAt: 'DESC' },
        take: 50,
      }),
    ]);

    const totalSales = sales.reduce((sum, sale) => sum + sale.quantity, 0);
    const totalRevenue = sales.reduce(
      (sum, sale) => sum + Number(sale.totalAmount),
      0,
    );

    return {
      totalUsers,
      activeUsers,
      newUsersToday,
      newUsersThisWeek,
      newUsersThisMonth,
      totalOrganizations,
      totalIntegrations,
      totalProducts,
      totalSales,
      totalRevenue,
      usersByPlan,
      recentActivity,
    };
  }

  private async getUsersByPlan(): Promise<Record<string, number>> {
    const users = await this.usersRepository.find({
      select: ['plan'],
    });

    const planCounts: Record<string, number> = {};
    users.forEach((user) => {
      planCounts[user.plan] = (planCounts[user.plan] || 0) + 1;
    });

    return planCounts;
  }

  async getAllUsers(
    page: number = 1,
    limit: number = 50,
    search?: string,
    role?: string,
    plan?: string,
    isActive?: boolean,
  ): Promise<{ users: User[]; total: number }> {
    const queryBuilder = this.usersRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.settings', 'settings');

    if (search) {
      queryBuilder.where(
        '(user.email ILIKE :search OR user.firstName ILIKE :search OR user.lastName ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    if (role) {
      queryBuilder.andWhere('user.role = :role', { role });
    }

    if (plan) {
      queryBuilder.andWhere('user.plan = :plan', { plan });
    }

    if (isActive !== undefined) {
      queryBuilder.andWhere('user.isActive = :isActive', { isActive });
    }

    const skip = (page - 1) * limit;
    queryBuilder.skip(skip).take(limit).orderBy('user.createdAt', 'DESC');

    const [users, total] = await queryBuilder.getManyAndCount();

    return { users, total };
  }

  async getUserActivity(userId: string): Promise<UserActivityStats> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new Error('User not found');
    }

    const activities = await this.activityRepository.find({
      where: { user: { id: userId } },
      order: { createdAt: 'DESC' },
      take: 100,
    });

    const loginActivities = activities.filter(
      (a) => a.type === ActivityType.LOGIN,
    );
    const lastLogin = loginActivities[0]?.createdAt || null;

    return {
      userId: user.id,
      userEmail: user.email,
      userName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
      loginCount: loginActivities.length,
      lastLoginAt: lastLogin,
      totalActions: activities.length,
      activities,
    };
  }

  async updateUser(
    userId: string,
    updates: {
      role?: string;
      plan?: string;
      isActive?: boolean;
      firstName?: string;
      lastName?: string;
    },
  ): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new Error('User not found');
    }

    Object.assign(user, updates);
    return this.usersRepository.save(user);
  }

  async deleteUser(userId: string): Promise<void> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new Error('User not found');
    }

    await this.usersRepository.remove(user);
  }

  async getUserDetails(userId: string): Promise<any> {
    const user = await this.usersRepository.findOne({
      where: { id: userId },
      relations: ['settings', 'activities'],
    });

    if (!user) {
      throw new Error('User not found');
    }

    const accounts = await this.accountsRepository.find({
      where: { user: { id: userId } },
    });

    const products = await this.productsRepository.count({
      where: { marketplaceAccount: { user: { id: userId } } },
    });

    const sales = await this.salesRepository
      .createQueryBuilder('sale')
      .leftJoin('sale.marketplaceAccount', 'account')
      .where('account.user.id = :userId', { userId })
      .select('SUM(sale.totalAmount)', 'totalRevenue')
      .addSelect('SUM(sale.quantity)', 'totalSales')
      .getRawOne();

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        plan: user.plan,
        isActive: user.isActive,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
      stats: {
        integrations: accounts.length,
        products,
        totalRevenue: sales?.totalRevenue || 0,
        totalSales: sales?.totalSales || 0,
      },
      accounts,
    };
  }
}

