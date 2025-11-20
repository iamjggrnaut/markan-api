import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Organization } from './organization.entity';
import {
  OrganizationMember,
  OrganizationRole,
} from './organization-member.entity';
import { UsersService } from '../users/users.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { AddMemberDto } from './dto/add-member.dto';

@Injectable()
export class OrganizationsService {
  constructor(
    @InjectRepository(Organization)
    private organizationsRepository: Repository<Organization>,
    @InjectRepository(OrganizationMember)
    private membersRepository: Repository<OrganizationMember>,
    private usersService: UsersService,
  ) {}

  async create(
    userId: string,
    createOrganizationDto: CreateOrganizationDto,
  ): Promise<Organization> {
    const organization = this.organizationsRepository.create(
      createOrganizationDto,
    );
    const savedOrg = await this.organizationsRepository.save(organization);

    // Создаем владельца организации
    const owner = this.membersRepository.create({
      organization: savedOrg,
      user: { id: userId } as any,
      role: OrganizationRole.OWNER,
    });
    await this.membersRepository.save(owner);

    return savedOrg;
  }

  async findAll(userId: string): Promise<Organization[]> {
    const members = await this.membersRepository.find({
      where: { user: { id: userId }, isActive: true },
      relations: ['organization'],
    });

    return members.map((member) => member.organization);
  }

  async findOne(id: string, userId: string): Promise<Organization> {
    const organization = await this.organizationsRepository.findOne({
      where: { id },
      relations: ['members', 'members.user'],
    });

    if (!organization) {
      throw new NotFoundException(`Organization with ID ${id} not found`);
    }

    // Проверяем доступ
    const member = await this.membersRepository.findOne({
      where: {
        organization: { id },
        user: { id: userId },
        isActive: true,
      },
    });

    if (!member) {
      throw new ForbiddenException('Access denied to this organization');
    }

    return organization;
  }

  async update(
    id: string,
    userId: string,
    updateOrganizationDto: UpdateOrganizationDto,
  ): Promise<Organization> {
    const organization = await this.findOne(id, userId);

    // Проверяем права (только OWNER или ADMIN)
    const member = await this.getMember(id, userId);
    if (
      member.role !== OrganizationRole.OWNER &&
      member.role !== OrganizationRole.ADMIN
    ) {
      throw new ForbiddenException('Insufficient permissions');
    }

    Object.assign(organization, updateOrganizationDto);
    return this.organizationsRepository.save(organization);
  }

  async remove(id: string, userId: string): Promise<void> {
    const organization = await this.findOne(id, userId);

    // Только OWNER может удалить организацию
    const member = await this.getMember(id, userId);
    if (member.role !== OrganizationRole.OWNER) {
      throw new ForbiddenException('Only owner can delete organization');
    }

    await this.organizationsRepository.remove(organization);
  }

  async getMembers(organizationId: string, userId: string) {
    await this.findOne(organizationId, userId); // Проверка доступа

    return this.membersRepository.find({
      where: { organization: { id: organizationId } },
      relations: ['user'],
      order: { createdAt: 'ASC' },
    });
  }

  async addMember(
    organizationId: string,
    userId: string,
    addMemberDto: AddMemberDto,
  ): Promise<OrganizationMember> {
    await this.findOne(organizationId, userId); // Проверка доступа

    // Проверяем права (только OWNER или ADMIN)
    const requester = await this.getMember(organizationId, userId);
    if (
      requester.role !== OrganizationRole.OWNER &&
      requester.role !== OrganizationRole.ADMIN
    ) {
      throw new ForbiddenException('Insufficient permissions to add members');
    }

    // Проверяем, не является ли пользователь уже членом
    const existingMember = await this.membersRepository.findOne({
      where: {
        organization: { id: organizationId },
        user: { id: addMemberDto.userId },
      },
    });

    if (existingMember) {
      throw new ForbiddenException('User is already a member');
    }

    const member = this.membersRepository.create({
      organization: { id: organizationId } as any,
      user: { id: addMemberDto.userId } as any,
      role: addMemberDto.role || OrganizationRole.MEMBER,
    });

    return this.membersRepository.save(member);
  }

  async updateMemberRole(
    organizationId: string,
    memberId: string,
    userId: string,
    newRole: OrganizationRole,
  ): Promise<OrganizationMember> {
    await this.findOne(organizationId, userId); // Проверка доступа

    // Проверяем права (только OWNER или ADMIN)
    const requester = await this.getMember(organizationId, userId);
    if (
      requester.role !== OrganizationRole.OWNER &&
      requester.role !== OrganizationRole.ADMIN
    ) {
      throw new ForbiddenException('Insufficient permissions');
    }

    const member = await this.membersRepository.findOne({
      where: { id: memberId, organization: { id: organizationId } },
    });

    if (!member) {
      throw new NotFoundException('Member not found');
    }

    // OWNER не может изменить роль другого OWNER
    if (member.role === OrganizationRole.OWNER && requester.role !== OrganizationRole.OWNER) {
      throw new ForbiddenException('Cannot change owner role');
    }

    member.role = newRole;
    return this.membersRepository.save(member);
  }

  async removeMember(
    organizationId: string,
    memberId: string,
    userId: string,
  ): Promise<void> {
    await this.findOne(organizationId, userId); // Проверка доступа

    // Проверяем права (только OWNER или ADMIN)
    const requester = await this.getMember(organizationId, userId);
    if (
      requester.role !== OrganizationRole.OWNER &&
      requester.role !== OrganizationRole.ADMIN
    ) {
      throw new ForbiddenException('Insufficient permissions');
    }

    const member = await this.membersRepository.findOne({
      where: { id: memberId, organization: { id: organizationId } },
    });

    if (!member) {
      throw new NotFoundException('Member not found');
    }

    // OWNER не может удалить другого OWNER
    if (member.role === OrganizationRole.OWNER && requester.role !== OrganizationRole.OWNER) {
      throw new ForbiddenException('Cannot remove owner');
    }

    await this.membersRepository.remove(member);
  }

  async getMember(
    organizationId: string,
    userId: string,
  ): Promise<OrganizationMember> {
    const member = await this.membersRepository.findOne({
      where: {
        organization: { id: organizationId },
        user: { id: userId },
        isActive: true,
      },
    });

    if (!member) {
      throw new ForbiddenException('User is not a member of this organization');
    }

    return member;
  }

  async getUserOrganizations(userId: string): Promise<Organization[]> {
    return this.findAll(userId);
  }

  async checkPermission(
    organizationId: string,
    userId: string,
    requiredRole?: OrganizationRole,
  ): Promise<boolean> {
    try {
      const member = await this.getMember(organizationId, userId);

      if (!requiredRole) {
        return true;
      }

      const roleHierarchy = {
        [OrganizationRole.VIEWER]: 1,
        [OrganizationRole.MEMBER]: 2,
        [OrganizationRole.MANAGER]: 3,
        [OrganizationRole.ADMIN]: 4,
        [OrganizationRole.OWNER]: 5,
      };

      return (
        roleHierarchy[member.role] >= roleHierarchy[requiredRole]
      );
    } catch {
      return false;
    }
  }
}

