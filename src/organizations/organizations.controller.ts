import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { OrganizationsService } from './organizations.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { AddMemberDto } from './dto/add-member.dto';
import { OrganizationRole } from './organization-member.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Organizations')
@Controller('organizations')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class OrganizationsController {
  constructor(
    private readonly organizationsService: OrganizationsService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Создать организацию' })
  create(@Request() req, @Body() createOrganizationDto: CreateOrganizationDto) {
    return this.organizationsService.create(
      req.user.userId,
      createOrganizationDto,
    );
  }

  @Get()
  @ApiOperation({ summary: 'Получить все организации пользователя' })
  findAll(@Request() req) {
    return this.organizationsService.findAll(req.user.userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Получить организацию по ID' })
  findOne(@Request() req, @Param('id') id: string) {
    return this.organizationsService.findOne(id, req.user.userId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Обновить организацию' })
  update(
    @Request() req,
    @Param('id') id: string,
    @Body() updateOrganizationDto: UpdateOrganizationDto,
  ) {
    return this.organizationsService.update(
      id,
      req.user.userId,
      updateOrganizationDto,
    );
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Удалить организацию' })
  remove(@Request() req, @Param('id') id: string) {
    return this.organizationsService.remove(id, req.user.userId);
  }

  @Get(':id/members')
  @ApiOperation({ summary: 'Получить членов организации' })
  getMembers(@Request() req, @Param('id') id: string) {
    return this.organizationsService.getMembers(id, req.user.userId);
  }

  @Post(':id/members')
  @ApiOperation({ summary: 'Добавить члена в организацию' })
  addMember(
    @Request() req,
    @Param('id') id: string,
    @Body() addMemberDto: AddMemberDto,
  ) {
    return this.organizationsService.addMember(
      id,
      req.user.userId,
      addMemberDto,
    );
  }

  @Patch(':id/members/:memberId/role')
  @ApiOperation({ summary: 'Изменить роль члена организации' })
  updateMemberRole(
    @Request() req,
    @Param('id') id: string,
    @Param('memberId') memberId: string,
    @Body('role') role: OrganizationRole,
  ) {
    return this.organizationsService.updateMemberRole(
      id,
      memberId,
      req.user.userId,
      role,
    );
  }

  @Delete(':id/members/:memberId')
  @ApiOperation({ summary: 'Удалить члена из организации' })
  removeMember(
    @Request() req,
    @Param('id') id: string,
    @Param('memberId') memberId: string,
  ) {
    return this.organizationsService.removeMember(
      id,
      memberId,
      req.user.userId,
    );
  }
}

