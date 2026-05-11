import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ProvidersService {
  constructor(@Inject(PrismaService) private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.providerProfile.findMany({
      include: { strategies: true, monitoringSnapshots: { orderBy: { snapshotDate: 'desc' }, take: 1 } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string) {
    const provider = await this.prisma.providerProfile.findUnique({
      where: { id },
      include: { strategies: true, monitoringSnapshots: { orderBy: { snapshotDate: 'desc' }, take: 1 } },
    });
    if (!provider) throw new NotFoundException('Provider not found');
    return provider;
  }

  async getMonitoring(id: string) {
    const provider = await this.prisma.providerProfile.findUnique({ where: { id } });
    if (!provider) throw new NotFoundException('Provider not found');
    const snapshot = await this.prisma.providerMonitoringSnapshot.findFirst({
      where: { providerId: id },
      orderBy: { snapshotDate: 'desc' },
    });
    if (!snapshot) throw new NotFoundException('No monitoring snapshot found');
    return snapshot;
  }

  async create(data: any) {
    const now = new Date();
    const sixMonths = new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000);
    return this.prisma.providerProfile.create({
      data: {
        providerName: data.providerName,
        strategy: data.strategy,
        status: data.status || 'APPROVED',
        providerType: data.providerType || 'Approved External Yield Provider',
        bankReviewStatus: 'Completed',
        kytStatus: data.kytStatus || 'Clear',
        ofacSanctionsStatus: data.ofacSanctionsStatus || 'Clear',
        travelRuleTreatment: data.travelRuleTreatment || 'External transfer edge review applied where applicable',
        protocolDueDiligence: 'Completed',
        mandateFit: data.mandateFit || ['conservative', 'balanced'],
        exposureLimit: data.exposureLimit || 50,
        lastReviewDate: now,
        nextReviewDate: sixMonths,
        jurisdictionTreatment: data.jurisdictionTreatment || 'Bank-reviewed',
        clientEligibility: data.clientEligibility || 'Institutional only',
        vaultEligibility: data.vaultEligibility || ['All eligible vaults'],
        destinationWallet: 'Approved',
        kytScreeningRequired: true,
        ofacScreeningRequired: true,
        travelRuleRequired: true,
        reviewNotes: data.reviewNotes || null,
      },
      include: { strategies: true, monitoringSnapshots: true },
    });
  }

  async updateStatus(id: string, status: string) {
    const provider = await this.prisma.providerProfile.findUnique({ where: { id } });
    if (!provider) throw new NotFoundException('Provider not found');
    return this.prisma.providerProfile.update({
      where: { id },
      data: { status },
    });
  }
}
