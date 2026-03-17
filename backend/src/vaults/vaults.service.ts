import { Injectable, Inject, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { SasService } from '../sas/sas.service';

@Injectable()
export class VaultsService {
  private prisma: PrismaService;
  private events: EventsService;
  private sas: SasService;
  constructor(
    @Inject(PrismaService) prisma: PrismaService,
    @Inject(EventsService) events: EventsService,
    @Inject(SasService) sas: SasService,
  ) {
    this.prisma = prisma;
    this.events = events;
    this.sas = sas;
  }

  /**
   * Verify that a wallet is the owner of a vault.
   * Throws ForbiddenException if the wallet doesn't match.
   */
  private async verifyVaultOwnership(vaultId: string, callerWallet?: string) {
    if (!callerWallet) return; // Skip if no wallet provided (admin operations)
    const vault = await this.prisma.vault.findUnique({ where: { vaultId } });
    if (!vault) throw new NotFoundException('Vault not found');
    if (vault.ownerWallet && vault.ownerWallet !== callerWallet) {
      throw new ForbiddenException(
        `Wallet ${callerWallet.slice(0, 8)}... is not the owner of vault ${vaultId}. Only the attested wallet can operate on this vault.`
      );
    }
  }

  /**
   * Get all vaults accessible by a specific wallet.
   */
  async findByWallet(walletAddress: string) {
    return this.prisma.vault.findMany({
      where: { ownerWallet: walletAddress },
      include: { mandate: true, credential: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findAll() {
    return this.prisma.vault.findMany({
      include: { mandate: true, credential: true, allocations: { include: { strategy: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(credentialId: string, baseAsset = 'USDC') {
    const credential = await this.prisma.credential.findUnique({ where: { credentialId } });
    if (!credential || credential.revoked || credential.status !== 'active') {
      throw new BadRequestException('Invalid or revoked credential. Cannot create vault.');
    }

    // Allow multiple vaults per credential (each is segregated)
    const count = await this.prisma.vault.count();
    const vaultId = `VLT-${String(count + 1).padStart(3, '0')}`;

    // Create vault in DB
    const vault = await this.prisma.vault.create({
      data: {
        vaultId,
        credentialId,
        clientReference: credential.clientReference,
        ownerWallet: credential.walletAddress,
        baseAsset,
        status: 'active',
      },
    });

    // Deploy vault on-chain via SAS attestation (binds vault to owner wallet)
    const sasResult = await this.sas.createVaultAttestation(credential.walletAddress, {
      vaultId,
      credentialId,
      clientReference: credential.clientReference,
      baseAsset,
    });

    if (sasResult) {
      await this.prisma.vault.update({
        where: { vaultId },
        data: {
          vaultAttestationPda: sasResult.pda,
          vaultAttestationTxSig: sasResult.txSignature,
          onChainAddress: sasResult.onChainAddress,
        },
      });
    }

    await this.events.emit({
      vaultId, actionType: 'VAULT_CREATED', actor: 'admin', role: 'Admin',
      result: 'success',
      reason: `Segregated vault ${vaultId} created for ${credential.clientReference} (wallet: ${credential.walletAddress.slice(0, 8)}...)${sasResult ? ' — deployed on-chain' : ''}`,
    });

    return { ...vault, vaultAttestationPda: sasResult?.pda, vaultAttestationTxSig: sasResult?.txSignature, onChainAddress: sasResult?.onChainAddress };
  }

  async getSnapshot(vaultId: string) {
    const vault = await this.prisma.vault.findUnique({
      where: { vaultId },
      include: { mandate: true, credential: true, allocations: { include: { strategy: true } }, deposits: true, consentRequests: true },
    });
    if (!vault) throw new NotFoundException('Vault not found');

    const activeAllocations = vault.allocations.filter((a) => a.status === 'active');
    const totalDeployed = activeAllocations.reduce((s, a) => s + a.amount, 0);
    const totalYield = activeAllocations.reduce((s, a) => s + a.yieldAccrued, 0);

    const strategyExposures: Record<string, { amount: number; yield: number; strategyId: string }> = {};
    activeAllocations.forEach((a) => {
      const key = a.strategy.name;
      if (!strategyExposures[key]) strategyExposures[key] = { amount: 0, yield: 0, strategyId: a.strategyId };
      strategyExposures[key].amount += a.amount;
      strategyExposures[key].yield += a.yieldAccrued;
    });

    return {
      vaultId: vault.vaultId, status: vault.status, paused: vault.paused, baseAsset: vault.baseAsset,
      clientReference: vault.clientReference, credentialId: vault.credentialId,
      idleBalance: vault.idleBalance, totalDeployed, totalYield,
      totalNAV: vault.idleBalance + totalDeployed + totalYield,
      mandateStatus: vault.mandate?.status || 'none',
      strategyExposures, pendingConsents: vault.consentRequests.filter((c) => c.status === 'pending').length,
      approvedDestinations: vault.mandate?.approvedDestinations || [],
      snapshotTime: new Date().toISOString(),
    };
  }

  async attachMandate(vaultId: string, data: {
    allowedStrategies: string[]; blockedStrategies: string[];
    maxAllocationBps: Record<string, number>; liquidityBufferBps: number;
    consentThreshold: number; leverageAllowed: boolean; approvedDestinations: string[];
  }) {
    const vault = await this.prisma.vault.findUnique({ where: { vaultId } });
    if (!vault) throw new NotFoundException('Vault not found');

    const existing = await this.prisma.mandate.findUnique({ where: { vaultId } });
    if (existing) {
      const mandate = await this.prisma.mandate.update({ where: { vaultId }, data });
      await this.events.emit({ vaultId, actionType: 'MANDATE_UPDATED', actor: 'admin', role: 'Admin', result: 'success', reason: `Mandate updated for vault ${vaultId}` });
      return mandate;
    }

    const mandate = await this.prisma.mandate.create({ data: { vaultId, ...data } });
    await this.events.emit({ vaultId, actionType: 'MANDATE_ATTACHED', actor: 'admin', role: 'Admin', result: 'success', reason: `Mandate bound to vault ${vaultId}` });
    return mandate;
  }

  async getMandate(vaultId: string) {
    const mandate = await this.prisma.mandate.findUnique({ where: { vaultId } });
    if (!mandate) throw new NotFoundException('No mandate found');
    return mandate;
  }

  async deposit(vaultId: string, amount: number, sourceWallet?: string, sourceReference?: string, sourceType?: string, jurisdictionTag?: string, callerWallet?: string) {
    await this.verifyVaultOwnership(vaultId, callerWallet);
    const vault = await this.prisma.vault.findUnique({ where: { vaultId } });
    if (!vault) throw new NotFoundException('Vault not found');
    if (vault.paused) throw new BadRequestException('Vault is paused');

    const deposit = await this.prisma.deposit.create({
      data: {
        vaultId, amount,
        sourceWallet: sourceWallet || '0xCUST...1188',
        sourceReference: sourceReference || `SRC-${Date.now()}`,
        sourceType: sourceType || 'Approved Custody-Linked Wallet',
        jurisdictionTag: jurisdictionTag || 'CH',
      },
    });

    const updated = await this.prisma.vault.update({
      where: { vaultId },
      data: { idleBalance: { increment: amount }, totalDeposited: { increment: amount }, totalNAV: { increment: amount } },
    });

    await this.events.emit({
      vaultId, actionType: 'DEPOSIT_RECORDED', actor: 'operations', role: 'Operations',
      asset: vault.baseAsset, amount, result: 'success',
      reason: `Deposit of ${amount.toLocaleString()} ${vault.baseAsset} recorded. Source: ${deposit.sourceReference}`,
    });

    return { deposit, vault: updated };
  }

  async allocate(vaultId: string, strategyId: string, amount: number) {
    const vault = await this.prisma.vault.findUnique({
      where: { vaultId },
      include: { mandate: true, allocations: true },
    });
    if (!vault) throw new NotFoundException('Vault not found');

    if (vault.paused) {
      await this.events.emit({ vaultId, actionType: 'ALLOCATION_BLOCKED', actor: 'portfolio_manager', role: 'Portfolio Manager', asset: vault.baseAsset, amount, strategy: strategyId, result: 'failure', reason: 'Vault is paused — all allocations blocked' });
      throw new BadRequestException('Vault is paused — all allocations blocked');
    }

    const strategy = await this.prisma.strategy.findUnique({ where: { strategyId } });
    if (!strategy) throw new NotFoundException('Strategy not found');

    if (strategy.disabled) {
      await this.events.emit({ vaultId, actionType: 'ALLOCATION_BLOCKED', actor: 'portfolio_manager', role: 'Portfolio Manager', asset: vault.baseAsset, amount, strategy: strategyId, result: 'failure', reason: `Strategy ${strategy.name} is disabled by emergency admin` });
      throw new BadRequestException(`Strategy ${strategy.name} is disabled by emergency admin`);
    }

    if (!vault.mandate) throw new BadRequestException('No mandate attached to vault');
    const mandate = vault.mandate;

    // Blocked strategy check
    if (mandate.blockedStrategies.includes(strategyId)) {
      await this.events.emit({ vaultId, actionType: 'ALLOCATION_BLOCKED', actor: 'portfolio_manager', role: 'Portfolio Manager', asset: vault.baseAsset, amount, strategy: strategyId, result: 'failure', reason: `Strategy "${strategy.name}" is not permitted by mandate` });
      throw new ForbiddenException(`Strategy "${strategy.name}" is not permitted by mandate`);
    }

    // Allowed strategy check
    if (!mandate.allowedStrategies.includes(strategyId)) {
      await this.events.emit({ vaultId, actionType: 'ALLOCATION_BLOCKED', actor: 'portfolio_manager', role: 'Portfolio Manager', asset: vault.baseAsset, amount, strategy: strategyId, result: 'failure', reason: `Strategy "${strategy.name}" is not in allowed list` });
      throw new ForbiddenException(`Strategy "${strategy.name}" is not in allowed list`);
    }

    // Cap check
    const caps = mandate.maxAllocationBps as Record<string, number>;
    const capBps = caps[strategyId] || 0;
    const maxAllocation = (vault.totalNAV * capBps) / 10000;
    const existingAlloc = vault.allocations.filter((a) => a.strategyId === strategyId && a.status === 'active').reduce((s, a) => s + a.amount, 0);

    if (existingAlloc + amount > maxAllocation) {
      const reason = `Allocation exceeds ${capBps / 100}% cap. Max: ${maxAllocation.toLocaleString()}, Current: ${existingAlloc.toLocaleString()}, Requested: ${amount.toLocaleString()}`;
      await this.events.emit({ vaultId, actionType: 'ALLOCATION_BLOCKED', actor: 'portfolio_manager', role: 'Portfolio Manager', asset: vault.baseAsset, amount, strategy: strategyId, result: 'failure', reason });
      throw new ForbiddenException(reason);
    }

    // Liquidity buffer check
    const requiredBuffer = (vault.totalNAV * mandate.liquidityBufferBps) / 10000;
    const postIdle = vault.idleBalance - amount;
    if (postIdle < requiredBuffer) {
      const reason = `Post-allocation idle balance (${postIdle.toLocaleString()}) below required buffer (${requiredBuffer.toLocaleString()})`;
      await this.events.emit({ vaultId, actionType: 'ALLOCATION_BLOCKED', actor: 'portfolio_manager', role: 'Portfolio Manager', asset: vault.baseAsset, amount, strategy: strategyId, result: 'failure', reason });
      throw new ForbiddenException(reason);
    }

    // Consent threshold check
    if (amount >= mandate.consentThreshold) {
      const existing = await this.prisma.consentRequest.findFirst({
        where: { vaultId, actionType: 'ALLOCATION', amount, status: 'approved' },
      });

      if (!existing) {
        const cnt = await this.prisma.consentRequest.count();
        const requestId = `CONS-${String(cnt + 1).padStart(3, '0')}`;

        await this.prisma.consentRequest.create({
          data: { requestId, vaultId, actionType: 'ALLOCATION', amount, details: { strategyId, strategyName: strategy.name }, initiator: 'portfolio_manager', status: 'pending' },
        });

        await this.events.emit({ vaultId, actionType: 'CONSENT_REQUESTED', actor: 'portfolio_manager', role: 'Portfolio Manager', asset: vault.baseAsset, amount, strategy: strategyId, result: 'pending', reason: `Amount ${amount.toLocaleString()} exceeds consent threshold ${mandate.consentThreshold.toLocaleString()}. Client approval required.` });

        return { status: 'consent_required', requestId, reason: `Amount ${amount.toLocaleString()} ${vault.baseAsset} exceeds consent threshold of ${mandate.consentThreshold.toLocaleString()} ${vault.baseAsset}. Client approval required.` };
      }
    }

    // Execute
    const allocation = await this.prisma.allocation.create({ data: { vaultId, strategyId, amount, status: 'active' } });
    await this.prisma.vault.update({ where: { vaultId }, data: { idleBalance: { decrement: amount } } });

    await this.events.emit({ vaultId, actionType: 'ALLOCATION_EXECUTED', actor: 'portfolio_manager', role: 'Portfolio Manager', asset: vault.baseAsset, amount, strategy: strategyId, result: 'success', reason: `Allocated ${amount.toLocaleString()} ${vault.baseAsset} to ${strategy.name}` });

    return { allocation, message: `Successfully allocated ${amount.toLocaleString()} ${vault.baseAsset} to ${strategy.name}` };
  }

  async redeem(vaultId: string, amount: number, destinationWallet: string, callerWallet?: string) {
    await this.verifyVaultOwnership(vaultId, callerWallet);
    const vault = await this.prisma.vault.findUnique({ where: { vaultId }, include: { mandate: true } });
    if (!vault) throw new NotFoundException('Vault not found');

    if (vault.mandate?.approvedDestinations?.length && !vault.mandate.approvedDestinations.includes(destinationWallet)) {
      await this.events.emit({ vaultId, actionType: 'WITHDRAWAL_BLOCKED', actor: 'client_representative', role: 'Client Representative', asset: vault.baseAsset, amount, result: 'failure', reason: `Destination ${destinationWallet} is not in approved destination list` });
      throw new ForbiddenException(`Destination ${destinationWallet} is not in approved destination list`);
    }

    if (amount > vault.idleBalance) {
      throw new BadRequestException(`Insufficient idle balance. Available: ${vault.idleBalance.toLocaleString()}`);
    }

    const updated = await this.prisma.vault.update({
      where: { vaultId },
      data: { idleBalance: { decrement: amount }, totalNAV: { decrement: amount } },
    });

    await this.events.emit({ vaultId, actionType: 'REDEMPTION_EXECUTED', actor: 'client_representative', role: 'Client Representative', asset: vault.baseAsset, amount, result: 'success', reason: `Redeemed ${amount.toLocaleString()} ${vault.baseAsset} to approved destination ${destinationWallet}` });

    return { message: `Redeemed ${amount.toLocaleString()} ${vault.baseAsset} to ${destinationWallet}`, vault: updated };
  }

  async unwind(vaultId: string, strategyId: string) {
    const vault = await this.prisma.vault.findUnique({
      where: { vaultId },
      include: { allocations: { where: { strategyId, status: 'active' } } },
    });
    if (!vault) throw new NotFoundException('Vault not found');
    if (!vault.allocations.length) throw new BadRequestException('No active allocations for this strategy');

    const totalUnwind = vault.allocations.reduce((s, a) => s + a.amount + a.yieldAccrued, 0);
    const yieldTotal = vault.allocations.reduce((s, a) => s + a.yieldAccrued, 0);

    await this.prisma.allocation.updateMany({ where: { vaultId, strategyId, status: 'active' }, data: { status: 'unwound' } });
    await this.prisma.vault.update({ where: { vaultId }, data: { idleBalance: { increment: totalUnwind }, totalNAV: { increment: yieldTotal } } });

    await this.events.emit({ vaultId, actionType: 'UNWIND_EXECUTED', actor: 'emergency_admin', role: 'Emergency Admin', asset: vault.baseAsset, amount: totalUnwind, strategy: strategyId, result: 'success', reason: `Unwound ${totalUnwind.toLocaleString()} ${vault.baseAsset} from strategy back to idle balance` });

    return { message: `Unwound ${totalUnwind.toLocaleString()} ${vault.baseAsset}`, totalUnwind };
  }

  async accrueYield(vaultId: string) {
    const vault = await this.prisma.vault.findUnique({
      where: { vaultId },
      include: { allocations: { where: { status: 'active' }, include: { strategy: true } } },
    });
    if (!vault) throw new NotFoundException('Vault not found');

    let totalYieldAccrued = 0;

    for (const alloc of vault.allocations) {
      // Simulate daily yield: strategy APY / 365
      const dailyRate = (alloc.strategy.currentYield / 100) / 365;
      const yieldAmount = Math.round(alloc.amount * dailyRate * 100) / 100;

      await this.prisma.allocation.update({
        where: { id: alloc.id },
        data: { yieldAccrued: { increment: yieldAmount } },
      });

      totalYieldAccrued += yieldAmount;
    }

    if (totalYieldAccrued > 0) {
      await this.prisma.vault.update({
        where: { vaultId },
        data: { totalNAV: { increment: totalYieldAccrued } },
      });
    }

    return {
      vaultId,
      yieldAccrued: totalYieldAccrued,
      message: `Accrued ${totalYieldAccrued.toFixed(2)} ${vault.baseAsset} in mock yield across ${vault.allocations.length} positions`,
    };
  }

  async togglePause(vaultId: string) {
    const vault = await this.prisma.vault.findUnique({ where: { vaultId } });
    if (!vault) throw new NotFoundException('Vault not found');

    const updated = await this.prisma.vault.update({ where: { vaultId }, data: { paused: !vault.paused } });

    await this.events.emit({
      vaultId, actionType: updated.paused ? 'VAULT_PAUSED' : 'VAULT_UNPAUSED',
      actor: 'emergency_admin', role: 'Emergency Admin', result: 'success',
      reason: updated.paused ? `Vault ${vaultId} paused — all allocations blocked` : `Vault ${vaultId} resumed — operations restored`,
    });

    return updated;
  }
}
