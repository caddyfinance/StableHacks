import { Injectable, Logger, Inject } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const JURISDICTIONS = [
  {
    code: 'CH',
    regulatorName: 'FINMA',
    licenseName: 'FinTech License',
    travelRuleThreshold: '1000',
    consentRequiredAbove: '100000',
    reportingCurrency: 'CHF',
    maxLeverageAllowed: false,
    amlScreeningRequired: true,
    active: true,
  },
  {
    code: 'AE',
    regulatorName: 'FSRA (ADGM)',
    licenseName: 'Regulated Virtual Asset Activity License',
    travelRuleThreshold: '3500',
    consentRequiredAbove: '50000',
    reportingCurrency: 'AED',
    maxLeverageAllowed: true,
    amlScreeningRequired: true,
    active: true,
  },
  {
    code: 'SG',
    regulatorName: 'MAS',
    licenseName: 'Major Payment Institution License',
    travelRuleThreshold: '1000',
    consentRequiredAbove: '200000',
    reportingCurrency: 'SGD',
    maxLeverageAllowed: false,
    amlScreeningRequired: true,
    active: true,
  },
  {
    code: 'EU',
    regulatorName: 'EBA / National CA',
    licenseName: 'MiCA CASP Authorization',
    travelRuleThreshold: '0',
    consentRequiredAbove: '100000',
    reportingCurrency: 'EUR',
    maxLeverageAllowed: false,
    amlScreeningRequired: true,
    active: true,
  },
  {
    code: 'UK',
    regulatorName: 'FCA',
    licenseName: 'FCA Cryptoasset Registration',
    travelRuleThreshold: '0',
    consentRequiredAbove: '100000',
    reportingCurrency: 'GBP',
    maxLeverageAllowed: false,
    amlScreeningRequired: true,
    active: true,
  },
];

@Injectable()
export class ComplianceLayerService {
  private readonly logger = new Logger(ComplianceLayerService.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async runHealthCheck(): Promise<{ overallScore: number; checks: Array<{ name: string; status: string; detail: string }> }> {
    const checks: Array<{ name: string; status: string; detail: string }> = [];

    const runCheck = async (
      name: string,
      fn: () => Promise<{ pass: boolean; detail: string }>,
    ) => {
      try {
        const result = await fn();
        checks.push({ name, status: result.pass ? 'pass' : 'fail', detail: result.detail });
      } catch (error: any) {
        checks.push({ name, status: 'fail', detail: `Error: ${error.message}` });
      }
    };

    await runCheck('Database Connectivity', async () => {
      const count = await this.prisma.adminUser.count();
      return { pass: true, detail: `Database reachable — ${count} admin user(s) found` };
    });

    await runCheck('Active Credentials', async () => {
      const count = await this.prisma.credential.count({ where: { status: 'active' } });
      return {
        pass: count > 0,
        detail: count > 0 ? `${count} active credential(s) found` : 'No active credentials',
      };
    });

    await runCheck('Active Vaults', async () => {
      const count = await this.prisma.vault.count({ where: { status: 'active' } });
      return {
        pass: count > 0,
        detail: count > 0 ? `${count} active vault(s) found` : 'No active vaults',
      };
    });

    await runCheck('Mandate Enforcement', async () => {
      const count = await this.prisma.mandate.count({
        where: { allowedStrategies: { isEmpty: false } },
      });
      return {
        pass: count > 0,
        detail: count > 0 ? `${count} mandate(s) with allowed strategies` : 'No mandates with allowed strategies',
      };
    });

    await runCheck('Consent Configuration', async () => {
      const count = await this.prisma.mandate.count({
        where: { consentThreshold: { gt: 0 } },
      });
      return {
        pass: count > 0,
        detail: count > 0 ? `${count} mandate(s) with consent threshold configured` : 'No mandates with consent threshold',
      };
    });

    await runCheck('Strategy Registry', async () => {
      const count = await this.prisma.strategy.count({ where: { active: true } });
      return {
        pass: count > 0,
        detail: count > 0 ? `${count} active strategy/strategies registered` : 'No active strategies',
      };
    });

    await runCheck('Event Logging', async () => {
      const count = await this.prisma.complianceEvent.count();
      return {
        pass: count > 0,
        detail: count > 0 ? `${count} compliance event(s) logged` : 'No compliance events found',
      };
    });

    await runCheck('Deposit Provenance', async () => {
      const count = await this.prisma.deposit.count({
        where: { sourceReference: { not: '' } },
      });
      return {
        pass: count > 0,
        detail: count > 0 ? `${count} deposit(s) with source reference` : 'No deposits with source reference',
      };
    });

    await runCheck('Destination Whitelist', async () => {
      const count = await this.prisma.mandate.count({
        where: { approvedDestinations: { isEmpty: false } },
      });
      return {
        pass: count > 0,
        detail: count > 0 ? `${count} mandate(s) with approved destinations` : 'No mandates with approved destinations',
      };
    });

    await runCheck('Translation Layer', async () => {
      const count = await this.prisma.complianceEvent.count({
        where: { actionType: { startsWith: 'TL_' } },
      });
      return {
        pass: count > 0,
        detail: count > 0 ? `${count} translation layer event(s) found` : 'No translation layer events found',
      };
    });

    const passes = checks.filter((c) => c.status === 'pass').length;
    const overallScore = Math.round((passes / checks.length) * 100);

    return { overallScore, checks };
  }

  // ─── Travel Rule (from TransferCheck) ──────────────────────────

  async getTravelRuleCheck(checkId: string): Promise<any | null> {
    try {
      const tc = await this.prisma.transferCheck.findFirst({
        where: { transferId: checkId },
      });
      if (!tc) {
        this.logger.warn(`TravelRuleCheck not found: ${checkId}`);
        return null;
      }

      const statusMap: Record<string, string> = {
        COMPLETE: 'Compliant',
        PENDING: 'PendingReview',
        NOT_REQUIRED: 'Exempt',
      };

      return {
        checkId: tc.transferId,
        originatorVasp: tc.fromController || 'Unknown',
        beneficiaryVasp: tc.toController || 'Unknown',
        originatorWallet: tc.fromAddress || '',
        beneficiaryWallet: tc.toAddress || '',
        amount: tc.amount.toString(),
        currency: tc.asset || 'USDC',
        originatorJurisdiction: 'CH',
        beneficiaryJurisdiction: 'External',
        thresholdApplied: '1000',
        status: statusMap[tc.travelRuleStatus] || tc.travelRuleStatus,
        checkedAt: tc.checkedAt?.toISOString() || new Date().toISOString(),
        pda: tc.travelRuleReference || tc.txSignature || '',
      };
    } catch (error: any) {
      this.logger.error(`Failed to fetch TravelRuleCheck ${checkId}: ${error.message}`);
      return null;
    }
  }

  async getTravelRuleChecksForVault(vaultId: string): Promise<any[]> {
    try {
      const checks = await this.prisma.transferCheck.findMany({
        where: { vaultId },
        orderBy: { checkedAt: 'desc' },
      });

      const statusMap: Record<string, string> = {
        COMPLETE: 'Compliant',
        PENDING: 'PendingReview',
        NOT_REQUIRED: 'Exempt',
      };

      return checks.map((tc) => ({
        checkId: tc.transferId,
        originatorVasp: tc.fromController || 'Unknown',
        beneficiaryVasp: tc.toController || 'Unknown',
        originatorWallet: tc.fromAddress || '',
        beneficiaryWallet: tc.toAddress || '',
        amount: tc.amount.toString(),
        currency: tc.asset || 'USDC',
        originatorJurisdiction: 'CH',
        beneficiaryJurisdiction: 'External',
        thresholdApplied: '1000',
        status: statusMap[tc.travelRuleStatus] || tc.travelRuleStatus,
        checkedAt: tc.checkedAt?.toISOString() || new Date().toISOString(),
        pda: tc.travelRuleReference || tc.txSignature || '',
      }));
    } catch (error: any) {
      this.logger.error(`Failed to fetch TravelRuleChecks for vault ${vaultId}: ${error.message}`);
      return [];
    }
  }

  // ─── VASPs (from ProviderProfile + TransferCheck) ──────────────

  async getVASPs(): Promise<any[]> {
    try {
      const providers = await this.prisma.providerProfile.findMany();

      const vasps = providers.map((p) => ({
        vaspId: `VASP-${p.providerName.replace(/\s+/g, '-').toUpperCase()}`,
        name: p.providerName,
        jurisdiction: 'External',
        lei: 'N/A',
        status: p.status === 'APPROVED' ? 'Active' : 'Suspended',
        registeredAt: p.createdAt.toISOString(),
        pda: `PROV-${p.providerName.replace(/\s+/g, '-').toUpperCase()}`,
      }));

      vasps.push({
        vaspId: 'VASP-AMINA-BANK',
        name: 'AMINA Bank (Originating VASP)',
        jurisdiction: 'CH',
        lei: '5493001KJTIIGC8Y1R12',
        status: 'Active',
        registeredAt: new Date('2024-01-01').toISOString(),
        pda: 'VASP-AMINA-BANK',
      });

      return vasps;
    } catch (error: any) {
      this.logger.error(`Failed to fetch VASPs: ${error.message}`);
      return [];
    }
  }

  // ─── Venues (from Strategy) ────────────────────────────────────

  async getVenues(): Promise<any[]> {
    try {
      const strategies = await this.prisma.strategy.findMany({
        where: { active: true },
      });

      return strategies.map((s) => ({
        venueId: s.strategyId,
        name: s.name,
        venueType: 'YieldVault',
        riskTier: s.riskLevel || 'Medium',
        supportedAssets: ['USDC'],
        status: s.active ? 'Active' : 'Suspended',
        registeredAt: s.createdAt.toISOString(),
        pda: s.strategyId,
      }));
    } catch (error: any) {
      this.logger.error(`Failed to fetch Venues: ${error.message}`);
      return [];
    }
  }

  // ─── Routing Decisions (from TranslationLayerInstruction) ──────

  async getRoutingDecisionsForVault(vaultId: string): Promise<any[]> {
    try {
      const instructions = await this.prisma.translationLayerInstruction.findMany({
        where: { vaultId },
        orderBy: { receivedAt: 'desc' },
      });

      return instructions
        .filter((instr) => instr.routingRef)
        .map((instr) => ({
          routingId: instr.routingRef,
          vaultId: instr.vaultId,
          strategyId: instr.strategyId,
          venueId: instr.strategyId,
          amount: instr.amount.toString(),
          eligible: instr.complianceResult === 'passed',
          routingReason: instr.status === 'complete'
            ? 'Venue eligible, mandate allows'
            : 'Pending compliance review',
          sourceTx: instr.instructionId,
          routedAt: instr.actionExecutedAt?.toISOString() || new Date().toISOString(),
          pda: instr.routingRef,
        }));
    } catch (error: any) {
      this.logger.error(`Failed to fetch RoutingDecisions for vault ${vaultId}: ${error.message}`);
      return [];
    }
  }

  // ─── Jurisdiction Engine (static config) ───────────────────────

  async getJurisdictions(): Promise<any[]> {
    return JURISDICTIONS.map((j) => ({
      ...j,
      pda: `JUR-${j.code}`,
    }));
  }

  async getJurisdiction(code: string): Promise<any | null> {
    const jurisdiction = JURISDICTIONS.find((j) => j.code === code.toUpperCase());
    if (!jurisdiction) {
      this.logger.warn(`Jurisdiction not found: ${code}`);
      return null;
    }
    return {
      ...jurisdiction,
      pda: `JUR-${jurisdiction.code}`,
    };
  }

  // ─── Compliance Attestations (from ComplianceEvent) ────────────

  async getComplianceAttestationsForVault(vaultId: string): Promise<any[]> {
    try {
      const events = await this.prisma.complianceEvent.findMany({
        where: {
          vaultId,
          actionType: { startsWith: 'TL_' },
        },
        orderBy: { timestamp: 'desc' },
      });

      return events.map((evt) => {
        const resultMap: Record<string, string> = {
          success: 'Passed',
          failure: 'Failed',
          pending: 'ReviewRequired',
        };

        return {
          attestationId: evt.eventId,
          vaultId: evt.vaultId || '',
          jurisdiction: 'CH',
          operationType: evt.actionType,
          amount: (evt.amount || 0).toString(),
          rulesApplied: evt.reason || '',
          travelRuleStatus: evt.travelRulePda ? 'Compliant' : 'NotApplicable',
          result: resultMap[evt.result] || evt.result,
          attestedAt: evt.timestamp?.toISOString() || new Date().toISOString(),
          pda: evt.compliancePda || evt.translationLayerRef || '',
        };
      });
    } catch (error: any) {
      this.logger.error(`Failed to fetch ComplianceAttestations for vault ${vaultId}: ${error.message}`);
      return [];
    }
  }
}
