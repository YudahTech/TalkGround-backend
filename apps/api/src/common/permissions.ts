import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AdminPermission } from '@prisma/client';
import type { AuthUser } from './current-user.decorator';

export const PERMISSIONS_KEY = 'permissions';

/**
 * Staff-only route. The caller must hold EVERY listed permission (PRD §8.1: role-based,
 * not every administrator gets every sensitive operation). With no arguments the caller
 * only has to be staff (have any admin role).
 */
export const RequirePermissions = (...permissions: AdminPermission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<
      AdminPermission[] | undefined
    >(PERMISSIONS_KEY, [context.getHandler(), context.getClass()]);
    if (required === undefined) return true;

    const { user } = context
      .switchToHttp()
      .getRequest<{ user?: AuthUser | null }>();
    if (!user?.isStaff) throw new ForbiddenException('Staff access only');
    const missing = required.filter((p) => !user.permissions.includes(p));
    if (missing.length) {
      throw new ForbiddenException(`Missing permission: ${missing.join(', ')}`);
    }
    return true;
  }
}
