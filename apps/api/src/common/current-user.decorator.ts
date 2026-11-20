import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/** The authenticated caller, as loaded fresh from the database on every request. */
export interface AuthUser {
  id: string;
  email: string;
  username: string;
  displayName: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  isStaff: boolean;
  /** Staff role key: moderator | admin | super_admin, or null. */
  adminRole: string | null;
  /** PRD §9 permission keys, e.g. "review.moderate". */
  permissions: string[];
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser =>
    ctx.switchToHttp().getRequest<{ user: AuthUser }>().user,
);
