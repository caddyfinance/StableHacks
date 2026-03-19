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
            { strategyId: 'STBL-YIELD-01', name: 'Stablecoin Lending Adapter', description: 'Low-risk stablecoin lending via approved institutional protocols', riskLevel: 'low', active: true, currentYield: 4.2 },
            { strategyId: 'TRSY-YIELD-01', name: 'Tokenised Treasury Adapter', description: 'Ultra-conservative tokenised US Treasury yield', riskLevel: 'low', active: true, currentYield: 3.8 },
            { strategyId: 'HIGH-DEFI-01', name: 'High Yield DeFi Adapter', description: 'Higher-risk DeFi yield farming — not permitted for conservative mandates', riskLevel: 'high', active: true, currentYield: 12.5 },
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
