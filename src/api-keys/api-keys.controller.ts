import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { ApiKeysService } from './api-keys.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';
import { UpdateApiKeyDto } from './dto/update-api-key.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('API Keys')
@Controller('api-keys')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ApiKeysController {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  @Post()
  @ApiOperation({ summary: 'Создать API ключ' })
  create(
    @Request() req,
    @Body() createDto: CreateApiKeyDto,
    @Query('organizationId') organizationId?: string,
  ) {
    return this.apiKeysService.create(
      req.user.userId,
      organizationId || null,
      createDto,
    );
  }

  @Get()
  @ApiOperation({ summary: 'Получить список API ключей' })
  findAll(
    @Request() req,
    @Query('organizationId') organizationId?: string,
  ) {
    return this.apiKeysService.findAll(
      req.user.userId,
      organizationId || null,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Получить API ключ' })
  findOne(@Request() req, @Param('id') id: string) {
    return this.apiKeysService.findOne(id, req.user.userId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Обновить API ключ' })
  update(
    @Request() req,
    @Param('id') id: string,
    @Body() updateDto: UpdateApiKeyDto,
  ) {
    return this.apiKeysService.update(id, req.user.userId, updateDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Удалить API ключ' })
  delete(@Request() req, @Param('id') id: string) {
    return this.apiKeysService.delete(id, req.user.userId);
  }
}

