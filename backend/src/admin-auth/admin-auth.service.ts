import { Injectable, Inject, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MockEntraService } from './mock-entra.service';

@Injectable()
export class AdminAuthService {
  private prisma: PrismaService;
  private entra: MockEntraService;

  constructor(
    @Inject(PrismaService) prisma: PrismaService,
    @Inject(MockEntraService) entra: MockEntraService,
  ) {
    this.prisma = prisma;
    this.entra = entra;
  }

  // Legacy password login (kept as fallback)
  async login(email: string, password: string) {
    const user = await this.prisma.adminUser.findUnique({ where: { email } });
    if (!user) throw new UnauthorizedException('Invalid email or password');
    if (!user.active) throw new UnauthorizedException('Account is deactivated');
    if (user.password !== password) throw new UnauthorizedException('Invalid email or password');

    return {
      authenticated: true,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    };
  }

  // Entra ID: get available identities (for demo role picker)
  getEntraUsers() {
    return this.entra.getAvailableUsers();
  }

  // Entra ID: generate auth code for a specific user
  initiateEntraLogin(email: string) {
    const result = this.entra.generateAuthCode(email);
    if (!result) throw new UnauthorizedException('User not found in Entra ID directory');
    return result;
  }

  // Entra ID: validate callback code and authenticate
  async validateEntraCallback(code: string) {
    const entraUser = this.entra.validateCallback(code);
    if (!entraUser) throw new UnauthorizedException('Invalid or expired authentication code');

    // Look up the user in our DB
    const dbUser = await this.prisma.adminUser.findUnique({ where: { email: entraUser.email } });
    if (!dbUser) throw new UnauthorizedException('User exists in Entra ID but not provisioned in vault system');
    if (!dbUser.active) throw new UnauthorizedException('Account is deactivated');

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
