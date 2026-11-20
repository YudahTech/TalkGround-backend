import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AdminPermission } from '@prisma/client';

/** The authenticated caller, as loaded fresh from the database on every request. */
export interface AuthUser {
  id: string;
  email: string;
  username: string;
  displayName: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  isStaff: boolean;
  adminRole: string | null;
  permissions: AdminPermission[];
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser =>
    ctx.switchToHttp().getRequest<{ user: AuthUser }>().user,
);
