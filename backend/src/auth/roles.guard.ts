import { Injectable, CanActivate, ExecutionContext, ForbiddenException, SetMetadata, Inject, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHmac } from 'crypto';

export type Role = 'admin' | 'portfolio_manager' | 'compliance_officer' | 'client_representative' | 'emergency_admin';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger('RolesGuard');

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
    const path = request.url;

    if (!role) {
      this.logger.warn(`UNAUTHORIZED_ACCESS: ${request.method} ${path} - Missing x-role header (required: ${requiredRoles.join(', ')})`);
      throw new ForbiddenException('Missing x-role header. Specify your role to access this endpoint.');
    }

    if (!requiredRoles.includes(role)) {
      this.logger.warn(`UNAUTHORIZED_ACCESS: ${request.method} ${path} - Role "${role}" not in [${requiredRoles.join(', ')}]`);
      throw new ForbiddenException(
        `Role "${role}" is not authorized. Required: ${requiredRoles.join(', ')}`,
      );
    }

    const authMode = process.env.AUTH_MODE || 'demo';
    if (authMode === 'production') {
      const secret = process.env.AUTH_HMAC_SECRET;
      if (!secret) {
        throw new ForbiddenException('Server misconfiguration: AUTH_HMAC_SECRET not set.');
      }

      const signature = request.headers['x-role-sig'] as string;
      const wallet = request.headers['x-wallet'] as string || '';
      const timestamp = request.headers['x-auth-timestamp'] as string || '';

      if (!signature || !timestamp) {
        this.logger.warn(`UNAUTHORIZED_ACCESS: ${request.method} ${path} - Missing HMAC signature or timestamp`);
        throw new ForbiddenException('Missing x-role-sig or x-auth-timestamp header. Authentication required.');
      }

      const tsNum = parseInt(timestamp, 10);
      if (isNaN(tsNum) || Math.abs(Date.now() - tsNum) > 5 * 60 * 1000) {
        this.logger.warn(`UNAUTHORIZED_ACCESS: ${request.method} ${path} - Expired timestamp`);
        throw new ForbiddenException('Request timestamp expired or invalid. Re-authenticate.');
      }

      const expectedSig = createHmac('sha256', secret)
        .update(`${role}:${wallet}:${timestamp}`)
        .digest('hex');

      if (signature !== expectedSig) {
        this.logger.warn(`UNAUTHORIZED_ACCESS: ${request.method} ${path} - Invalid HMAC signature`);
        throw new ForbiddenException('Invalid role signature. Authentication failed.');
      }
    }

    return true;
  }
}
