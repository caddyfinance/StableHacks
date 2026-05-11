import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReportsService {
  constructor(@Inject(PrismaService) private prisma: PrismaService) {}

  async getComplianceReport(vaultId: string) {
    const vault = await this.prisma.vault.findUnique({
      where: { vaultId },
      include: {
        credential: true,
        mandate: true,
        allocations: { include: { strategy: { include: { provider: true } } } },
        deposits: { orderBy: { createdAt: 'desc' } },
        events: { orderBy: { timestamp: 'desc' }, take: 50 },
      },
    });
    if (!vault) throw new NotFoundException('Vault not found');

    const transferChecks = await this.prisma.transferCheck.findMany({
      where: { vaultId },
      orderBy: { checkedAt: 'desc' },
    });

    const walletControllers = await this.prisma.walletController.findMany({
      where: {
        OR: [
          { vaultId },
          { address: vault.ownerWallet },
        ],
      },
    });

    const allWalletControllers = await this.prisma.walletController.findMany();
    const relevantAddresses = new Set<string>();
    transferChecks.forEach(tc => {
      relevantAddresses.add(tc.fromAddress);
      relevantAddresses.add(tc.toAddress);
    });
    const involvedControllers = allWalletControllers.filter(wc => relevantAddresses.has(wc.address));

    const providers = await this.prisma.providerProfile.findMany({
      where: { strategies: { some: { allocations: { some: { vaultId } } } } },
    });

    return {
      reportGeneratedAt: new Date().toISOString(),
      vault: {
        vaultId: vault.vaultId,
        clientReference: vault.clientReference,
        ownerWallet: vault.ownerWallet,
        baseAsset: vault.baseAsset,
        status: vault.status,
        totalNAV: vault.totalNAV,
        idleBalance: vault.idleBalance,
        totalDeposited: vault.totalDeposited,
        onChainAddress: vault.onChainAddress,
        programId: vault.programId,
      },
      credential: {
        credentialId: vault.credential.credentialId,
        clientReference: vault.credential.clientReference,
        jurisdiction: vault.credential.jurisdiction,
        riskTier: vault.credential.riskTier,
        walletAddress: vault.credential.walletAddress,
        attestationPda: vault.credential.attestationPda,
        status: vault.credential.status,
      },
      mandate: vault.mandate ? {
        allowedStrategies: vault.mandate.allowedStrategies,
        liquidityBufferBps: vault.mandate.liquidityBufferBps,
        consentThreshold: vault.mandate.consentThreshold,
        leverageAllowed: vault.mandate.leverageAllowed,
        approvedDestinations: vault.mandate.approvedDestinations,
        version: vault.mandate.version,
        onChainSynced: vault.mandate.onChainSynced,
      } : null,
      providerProfiles: providers.map(p => ({
        providerName: p.providerName,
        status: p.status,
        kytStatus: p.kytStatus,
        ofacSanctionsStatus: p.ofacSanctionsStatus,
        travelRuleTreatment: p.travelRuleTreatment,
        exposureLimit: p.exposureLimit,
        lastReviewDate: p.lastReviewDate,
      })),
      walletControllers: involvedControllers.map(wc => ({
        address: wc.address,
        controllerName: wc.controllerName,
        controllerType: wc.controllerType,
        permittedUse: wc.permittedUse,
        verificationStatus: wc.verificationStatus,
        explorerLink: wc.explorerLink,
      })),
      transferChecks: transferChecks.map(tc => ({
        transferId: tc.transferId,
        transferType: tc.transferType,
        fromAddress: tc.fromAddress,
        fromController: tc.fromController,
        toAddress: tc.toAddress,
        toController: tc.toController,
        asset: tc.asset,
        amount: tc.amount,
        kytStatus: tc.kytStatus,
        ofacStatus: tc.ofacStatus,
        travelRuleStatus: tc.travelRuleStatus,
        overallStatus: tc.overallStatus,
        checkedAt: tc.checkedAt,
      })),
      auditTimeline: vault.events.map(e => ({
        eventId: e.eventId,
        actionType: e.actionType,
        actor: e.actor,
        role: e.role,
        result: e.result,
        reason: e.reason,
        txSignature: e.txSignature,
        timestamp: e.timestamp,
      })),
    };
  }
}
