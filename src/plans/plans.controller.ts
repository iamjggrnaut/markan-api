import { Controller, Get, Post, Param, UseGuards, Request, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PlansService } from './plans.service';
import { PlanType } from './plan.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Plans')
@Controller('plans')
export class PlansController {
  constructor(private readonly plansService: PlansService) {}

  @Get()
  @ApiOperation({ summary: 'Получить все доступные тарифные планы' })
  findAll() {
    return this.plansService.getPlansWithPeriods();
  }

  @Get('my')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Получить лимиты текущего тарифа пользователя' })
  getMyPlanLimits(@Request() req) {
    return this.plansService.getUserPlanLimits(req.user.userId);
  }

  @Get('my/trial')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Получить информацию о пробном периоде пользователя' })
  getMyTrialInfo(@Request() req) {
    return this.plansService.getUserTrialInfo(req.user.userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Получить тарифный план по ID' })
  findOne(@Param('id') id: string) {
    return this.plansService.findOne(id);
  }

  @Post('change/:planType')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Сменить тарифный план' })
  changePlan(
    @Request() req,
    @Param('planType') planType: PlanType,
    @Body() body: { billingPeriod?: string },
  ) {
    return this.plansService.changeUserPlan(
      req.user.userId,
      planType,
      body.billingPeriod || 'monthly',
    );
  }
}

