import { Injectable, Logger, Inject, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FinstarService {
  private readonly logger = new Logger(FinstarService.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async getConfig() {
    const [totalDeposits, totalAllocations, totalVaults, totalBookBacks] = await Promise.all([
      this.prisma.deposit.count(),
      this.prisma.allocation.count(),
      this.prisma.vault.count(),
      this.prisma.translationLayerInstruction.count({ where: { status: 'complete' } }),
    ]);

    const [totalCredits, totalDebits] = await Promise.all([
      this.prisma.gLEntry.aggregate({ where: { direction: 'credit' }, _sum: { amount: true } }),
      this.prisma.gLEntry.aggregate({ where: { direction: 'debit' }, _sum: { amount: true } }),
    ]);

    const [pendingCount, postedCount] = await Promise.all([
      this.prisma.gLEntry.count({ where: { status: 'pending' } }),
      this.prisma.gLEntry.count({ where: { status: 'posted' } }),
    ]);

    return {
      institution: 'AMINA Bank AG',
      swiftCode: 'AMINCHZZXXX',
      coreBanking: 'Finstar (via HBL ASP/BSP)',
      totalDeposits,
      totalAllocations,
      totalVaults,
      totalBookBacks,
      totalCredits: totalCredits._sum.amount || 0,
      totalDebits: totalDebits._sum.amount || 0,
      pendingGLEntries: pendingCount,
      postedGLEntries: postedCount,
    };
  }

  async getGLEntries(vaultId: string) {
    const entries = await this.prisma.gLEntry.findMany({
      where: { vaultId },
      orderBy: { createdAt: 'desc' },
    });

    return entries.map((entry) => ({
      entryId: entry.entryId,
      vaultId: entry.vaultId,
      instructionId: entry.instructionId,
      entryType: entry.entryType,
      direction: entry.direction,
      amount: entry.amount,
      currency: entry.currency,
      debitAccount: entry.debitAccount,
      creditAccount: entry.creditAccount,
      narrative: entry.narrative,
      swiftReference: entry.swiftReference,
      jurisdiction: entry.jurisdiction,
      status: entry.status,
      approvedBy: entry.approvedBy,
      approvedAt: entry.approvedAt,
      postedAt: entry.postedAt,
      rejectionReason: entry.rejectionReason,
      sourceType: entry.sourceType,
      sourceId: entry.sourceId,
      createdAt: entry.createdAt,
    }));
  }

  async getVaultLedger(vaultId: string) {
    const vault = await this.prisma.vault.findUnique({ where: { vaultId } });
    if (!vault) throw new NotFoundException(`Vault not found: ${vaultId}`);

    const entries = await this.getGLEntries(vaultId);

    const totalCredits = entries
      .filter((e) => e.direction === 'credit' && e.status === 'posted')
      .reduce((sum, e) => sum + e.amount, 0);

    const totalDebits = entries
      .filter((e) => e.direction === 'debit' && e.status === 'posted')
      .reduce((sum, e) => sum + e.amount, 0);

    const runningBalance = totalCredits - totalDebits;

    return {
      vaultId,
      vaultName: vault.clientReference,
      baseAsset: vault.baseAsset,
      currentNAV: vault.totalNAV,
      idleBalance: vault.idleBalance,
      totalDeposited: vault.totalDeposited,
      totalCredits,
      totalDebits,
      runningBalance,
      entryCount: entries.length,
      entries,
    };
  }

  async getEntry(entryId: string) {
    const entry = await this.prisma.gLEntry.findUnique({
      where: { entryId },
    });
    if (!entry) {
      throw new NotFoundException(`GL entry not found: ${entryId}`);
    }
    return entry;
  }

  async getRegulatoryReports(vaultId: string) {
    const transferChecks = await this.prisma.transferCheck.findMany({
      where: { vaultId },
      orderBy: { checkedAt: 'desc' },
      take: 50,
    });

    return transferChecks.map((tc) => ({
      reportId: `REG-${tc.transferId.substring(0, 8).toUpperCase()}`,
      transferId: tc.transferId,
      transferType: tc.transferType,
      jurisdiction: 'CH',
      kytStatus: tc.kytStatus,
      ofacStatus: tc.ofacStatus,
      travelRuleStatus: tc.travelRuleStatus,
      providerApproval: tc.providerApproval,
      mandateCheck: tc.mandateCheck,
      overallStatus: tc.overallStatus,
      submitted: tc.overallStatus === 'PASSED',
      checkedAt: tc.checkedAt,
    }));
  }

  async getActivity(vaultId?: string) {
    const depositFilter = vaultId ? { vaultId } : {};
    const glFilter = vaultId ? { vaultId } : {};

    const [deposits, allocations, glEntries] = await Promise.all([
      this.prisma.deposit.findMany({ where: depositFilter, orderBy: { createdAt: 'desc' }, take: 25 }),
      this.prisma.allocation.findMany({
        where: vaultId ? { vaultId } : {},
        orderBy: { createdAt: 'desc' },
        take: 25,
        include: { strategy: { select: { name: true, strategyId: true } } },
      }),
      this.prisma.gLEntry.findMany({ where: glFilter, orderBy: { createdAt: 'desc' }, take: 50 }),
    ]);

    const activity: any[] = [];

    for (const d of deposits) {
      activity.push({
        type: 'Deposit',
        vaultId: d.vaultId,
        amount: d.amount,
        asset: 'USDC',
        status: 'Recorded',
        reference: d.sourceReference || d.id,
        layer: 'L1',
        layerLabel: 'Finstar Core Banking',
        timestamp: d.createdAt.toISOString(),
      });
    }

    for (const a of allocations) {
      const entryType = a.status === 'unwound' ? 'StrategyUnwind' : 'StrategyAllocation';
      activity.push({
        type: entryType,
        vaultId: a.vaultId,
        amount: a.amount,
        asset: 'USDC',
        status: a.status === 'unwound' ? 'Unwound' : 'Allocated',
        reference: a.id,
        strategy: a.strategy?.name,
        layer: 'L1',
        layerLabel: 'Finstar Core Banking',
        timestamp: a.createdAt.toISOString(),
      });
    }

    for (const gl of glEntries) {
      activity.push({
        type: gl.entryType,
        vaultId: gl.vaultId,
        amount: gl.amount,
        asset: gl.currency,
        status: gl.status,
        reference: gl.entryId,
        direction: gl.direction,
        debitAccount: gl.debitAccount,
        creditAccount: gl.creditAccount,
        narrative: gl.narrative,
        layer: 'L1',
        layerLabel: 'Finstar Core Banking',
        timestamp: gl.createdAt.toISOString(),
      });
    }

    activity.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    const summary = {
      totalDeposits: deposits.reduce((s, d) => s + d.amount, 0),
      totalAllocations: allocations.filter((a) => a.status !== 'unwound').reduce((s, a) => s + a.amount, 0),
      totalUnwinds: allocations.filter((a) => a.status === 'unwound').reduce((s, a) => s + a.amount, 0),
      depositCount: deposits.length,
      allocationCount: allocations.length,
      totalGLEntries: glEntries.length,
      pendingGLEntries: glEntries.filter((e) => e.status === 'pending').length,
      postedGLEntries: glEntries.filter((e) => e.status === 'posted').length,
    };

    return { summary, activity };
  }

  // ─── GL Approval Workflow ──────────────────────────────────────

  async getPendingEntries(vaultId?: string) {
    const where: any = { status: 'pending' };
    if (vaultId) where.vaultId = vaultId;

    const entries = await this.prisma.gLEntry.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      include: {
        vault: { select: { clientReference: true, baseAsset: true } },
      },
    });

    return entries.map((e) => ({
      entryId: e.entryId,
      vaultId: e.vaultId,
      vaultName: e.vault.clientReference,
      instructionId: e.instructionId,
      entryType: e.entryType,
      direction: e.direction,
      amount: e.amount,
      currency: e.currency,
      debitAccount: e.debitAccount,
      creditAccount: e.creditAccount,
      narrative: e.narrative,
      swiftReference: e.swiftReference,
      jurisdiction: e.jurisdiction,
      status: e.status,
      createdAt: e.createdAt,
    }));
  }

  async approveEntry(entryId: string, approverRole: string, approverEmail?: string): Promise<any> {
    const entry = await this.prisma.gLEntry.findUnique({ where: { entryId } });
    if (!entry) throw new NotFoundException(`GL entry not found: ${entryId}`);

    if (entry.status !== 'pending') {
      throw new BadRequestException(`GL entry ${entryId} is in status '${entry.status}', expected 'pending'.`);
    }

    const now = new Date();
    const updated = await this.prisma.gLEntry.update({
      where: { entryId },
      data: {
        status: 'posted',
        approvedBy: approverEmail || approverRole,
        approvedAt: now,
        postedAt: now,
      },
    });

    this.logger.log(`GL entry ${entryId} approved by ${approverEmail || approverRole}`);

    return {
      entryId: updated.entryId,
      status: updated.status,
      approvedBy: updated.approvedBy,
      approvedAt: updated.approvedAt,
      postedAt: updated.postedAt,
    };
  }

  async rejectEntry(entryId: string, approverRole: string, reason: string, approverEmail?: string): Promise<any> {
    const entry = await this.prisma.gLEntry.findUnique({ where: { entryId } });
    if (!entry) throw new NotFoundException(`GL entry not found: ${entryId}`);

    if (entry.status !== 'pending') {
      throw new BadRequestException(`GL entry ${entryId} is in status '${entry.status}', expected 'pending'.`);
    }

    const updated = await this.prisma.gLEntry.update({
      where: { entryId },
      data: {
        status: 'rejected',
        approvedBy: approverEmail || approverRole,
        approvedAt: new Date(),
        rejectionReason: reason,
      },
    });

    this.logger.log(`GL entry ${entryId} rejected by ${approverEmail || approverRole}: ${reason}`);

    return {
      entryId: updated.entryId,
      status: updated.status,
      approvedBy: updated.approvedBy,
      rejectionReason: updated.rejectionReason,
    };
  }

  async bulkApprove(entryIds: string[], approverRole: string, approverEmail?: string): Promise<any> {
    const results: any[] = [];
    for (const id of entryIds) {
      try {
        const result = await this.approveEntry(id, approverRole, approverEmail);
        results.push({ entryId: id, ...result });
      } catch (err: any) {
        results.push({ entryId: id, error: err.message });
      }
    }
    return { approved: results.filter((r) => !r.error).length, failed: results.filter((r) => r.error).length, results };
  }
}
