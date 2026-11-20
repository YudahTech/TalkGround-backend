import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthUser } from './current-user.decorator';

/** PRD v2.5 §9 permission keys. Permissions are separate from roles. */
export const PERMISSIONS = {
  REVIEW_MODERATE: 'review.moderate',
  REPORT_RESOLVE: 'report.resolve',
  EVIDENCE_REVIEW: 'evidence.review',
  SUGGESTION_RESOLVE: 'suggestion.resolve',
  CLAIM_DECIDE: 'claim.decide',
  BUSINESS_CREATE: 'business.create',
  BUSINESS_EDIT: 'business.edit',
  BUSINESS_SUSPEND: 'business.suspend',
  BUSINESS_MERGE: 'business.merge',
  DISPUTE_DECIDE: 'dispute.decide',
  USER_SUSPEND: 'user.suspend',
  CATEGORY_MANAGE: 'category.manage',
  ROLE_ASSIGN: 'role.assign',
  AUDITLOG_EXPORT: 'auditlog.export',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
export const ALL_PERMISSIONS: Permission[] = Object.values(PERMISSIONS);

export const PERMISSIONS_KEY = 'permissions';

/**
 * Staff-only route. The caller must hold EVERY listed permission. With no arguments the
 * caller only has to be staff (any staff role).
 */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[] | undefined>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
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
