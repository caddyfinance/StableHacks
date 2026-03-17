import { Injectable, CanActivate, ExecutionContext, ForbiddenException, SetMetadata, Inject } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

export type Role = 'admin' | 'portfolio_manager' | 'compliance_officer' | 'client_representative' | 'emergency_admin';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(@Inject(Reflector) private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (!this.reflector) {
      return true;
    }

    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const role = request.headers['x-role'] as Role;

    if (!role) {
      throw new ForbiddenException('Missing x-role header. Specify your role to access this endpoint.');
    }

    if (!requiredRoles.includes(role)) {
      throw new ForbiddenException(
        `Role "${role}" is not authorized. Required: ${requiredRoles.join(', ')}`,
      );
    }

    return true;
  }
}
