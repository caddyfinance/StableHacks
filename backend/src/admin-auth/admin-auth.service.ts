import { Injectable, Inject, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MockEntraService } from './mock-entra.service';
import { EventsService } from '../events/events.service';

@Injectable()
export class AdminAuthService {
  private prisma: PrismaService;
  private entra: MockEntraService;
  private events: EventsService;

  constructor(
    @Inject(PrismaService) prisma: PrismaService,
    @Inject(MockEntraService) entra: MockEntraService,
    @Inject(EventsService) events: EventsService,
  ) {
    this.prisma = prisma;
    this.entra = entra;
    this.events = events;
  }

  async login(email: string, password: string) {
    const user = await this.prisma.adminUser.findUnique({ where: { email } });
    if (!user) {
      await this.events.emit({ vaultId: undefined, actionType: 'SESSION_FAILED', actor: email, role: 'unknown', result: 'failure', reason: 'Login failed: user not found' });
      throw new UnauthorizedException('Invalid email or password');
    }
    if (!user.active) {
      await this.events.emit({ vaultId: undefined, actionType: 'SESSION_FAILED', actor: email, role: user.role, result: 'failure', reason: 'Login failed: account deactivated' });
      throw new UnauthorizedException('Account is deactivated');
    }
    if (user.password !== password) {
      await this.events.emit({ vaultId: undefined, actionType: 'SESSION_FAILED', actor: email, role: user.role, result: 'failure', reason: 'Login failed: invalid password' });
      throw new UnauthorizedException('Invalid email or password');
    }

    await this.events.emit({ vaultId: undefined, actionType: 'SESSION_STARTED', actor: email, role: user.role, result: 'success', reason: `Admin authenticated via legacy login (${user.role})` });

    return {
      authenticated: true,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    };
  }

  getEntraUsers() {
    return this.entra.getAvailableUsers();
  }

  initiateEntraLogin(email: string) {
    const result = this.entra.generateAuthCode(email);
    if (!result) throw new UnauthorizedException('User not found in Entra ID directory');
    return result;
  }

  async validateEntraCallback(code: string) {
    const entraUser = this.entra.validateCallback(code);
    if (!entraUser) {
      await this.events.emit({ vaultId: undefined, actionType: 'SESSION_FAILED', actor: 'unknown', role: 'unknown', result: 'failure', reason: 'Entra ID callback: invalid or expired auth code' });
      throw new UnauthorizedException('Invalid or expired authentication code');
    }

    const dbUser = await this.prisma.adminUser.findUnique({ where: { email: entraUser.email } });
    if (!dbUser) {
      await this.events.emit({ vaultId: undefined, actionType: 'SESSION_FAILED', actor: entraUser.email, role: 'unknown', result: 'failure', reason: 'Entra ID user not provisioned in vault system' });
      throw new UnauthorizedException('User exists in Entra ID but not provisioned in vault system');
    }
    if (!dbUser.active) {
      await this.events.emit({ vaultId: undefined, actionType: 'SESSION_FAILED', actor: entraUser.email, role: dbUser.role, result: 'failure', reason: 'Entra ID login: account deactivated' });
      throw new UnauthorizedException('Account is deactivated');
    }

    await this.events.emit({ vaultId: undefined, actionType: 'SESSION_STARTED', actor: entraUser.email, role: dbUser.role, result: 'success', reason: `Admin authenticated via Microsoft Entra ID (${dbUser.role})` });

    return {
      authenticated: true,
      provider: 'entra_id',
      user: {
        id: dbUser.id,
        email: dbUser.email,
        name: dbUser.name,
        role: dbUser.role,
        department: entraUser.department,
      },
    };
  }

  async listUsers() {
    return this.prisma.adminUser.findMany({
      select: { id: true, email: true, name: true, role: true, active: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
  }
}
