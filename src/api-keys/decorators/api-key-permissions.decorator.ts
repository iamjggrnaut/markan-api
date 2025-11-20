import { SetMetadata } from '@nestjs/common';

export const ApiKeyPermissions = (...permissions: string[]) =>
  SetMetadata('permissions', permissions);

