import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    await this.$connect();
    await this.autoSeed();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  private async autoSeed() {
    try {
      const userCount = await this.adminUser.count();
      if (userCount > 0) return;

      this.logger.log('No admin users found — auto-seeding database...');

      await this.adminUser.createMany({
        data: [
          { email: 'admin@amina.bank', password: 'admin123', name: 'Sarah Chen', role: 'admin' },
          { email: 'pm@amina.bank', password: 'pm123', name: 'Marcus Weber', role: 'portfolio_manager' },
          { email: 'compliance@amina.bank', password: 'compliance123', name: 'Elena Rossi', role: 'compliance_officer' },
          { email: 'emergency@amina.bank', password: 'emergency123', name: 'James Park', role: 'emergency_admin' },
        ],
      });

      const strategyCount = await this.strategy.count();
      if (strategyCount === 0) {
        await this.strategy.createMany({
          data: [
            { strategyId: 'solstice-eusx-yield', name: 'Solstice eUSX Yield', description: 'On-chain yield via Solstice eUSX vault — deposit USDC, receive yield-bearing eUSX', riskLevel: 'low', active: true, currentYield: 8.5 },
          ],
        });
        this.logger.log('Seeded strategies');
      }

      this.logger.log('Auto-seed complete — 4 admin users and strategies created');
    } catch (e) {
      this.logger.warn(`Auto-seed skipped: ${(e as Error).message}`);
    }
  }
}
