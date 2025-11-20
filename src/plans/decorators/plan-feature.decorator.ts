import { SetMetadata } from '@nestjs/common';

export const PLAN_FEATURE_KEY = 'planFeature';
export const PlanFeature = (feature: string) => SetMetadata(PLAN_FEATURE_KEY, feature);

