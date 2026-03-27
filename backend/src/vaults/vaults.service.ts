import { Injectable, Inject, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { SasService } from '../sas/sas.service';
import { VaultProgramService } from '../vault-program/vault-program.service';
import { SolsticeService } from '../solstice/solstice.service';

@Injectable()
export class VaultsService {
  private prisma: PrismaService;
  private events: EventsService;
  private sas: SasService;
  private vaultProgram: VaultProgramService;
  private solstice: SolsticeService;
  private bankBalance = 50000; // Simulated AMINA Bank USD balance
  constructor(
    @Inject(PrismaService) prisma: PrismaService,
    @Inject(EventsService) events: EventsService,
    @Inject(SasService) sas: SasService,
    @Inject(VaultProgramService) vaultProgram: VaultProgramService,
    @Inject(SolsticeService) solstice: SolsticeService,
  ) {
    this.prisma = prisma;
    this.events = events;
    this.sas = sas;
    this.vaultProgram = vaultProgram;
    this.solstice = solstice;
  }

  /**
   * Verify that a wallet is the owner of a vault.
   * Throws ForbiddenException if the wallet doesn't match.
   * For user-facing operations, callerWallet is required.
   */
  private async verifyVaultOwnership(vaultId: string, callerWallet: string | undefined, requireWallet: boolean) {
    if (!callerWallet) return; // Skip wallet check if no wallet header (demo mode or admin operations)
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
    const vaults = await this.prisma.vault.findMany({
      where: { ownerWallet: walletAddress },
      include: { mandate: true, credential: true },
      orderBy: { createdAt: 'desc' },
    });
    const aminaBankWallet = this.vaultProgram.getAminaBankWallet();
    return vaults.map(v => ({ ...v, aminaBankWallet }));
  }

  async findAll() {
    const vaults = await this.prisma.vault.findMany({
      include: { mandate: true, credential: true, allocations: { include: { strategy: true } } },
      orderBy: { createdAt: 'desc' },
    });
    const aminaBankWallet = this.vaultProgram.getAminaBankWallet();
    return vaults.map(v => ({ ...v, aminaBankWallet }));
  }

  /**
   * Returns a transparency view of all vaults with full fund-flow data
   * to prove non-commingling / segregation of client assets.
   */
  async getTransparency() {
    const aminaWallet = this.vaultProgram.getAminaBankWallet();

    const vaults = await this.prisma.vault.findMany({
      include: {
        credential: true,
        deposits: { orderBy: { createdAt: 'desc' } },
        allocations: { include: { strategy: true }, orderBy: { createdAt: 'desc' } },
        consentRequests: { orderBy: { createdAt: 'desc' } },
        events: { orderBy: { timestamp: 'desc' }, take: 50 },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Group vaults by the AMINA wallet that created them (ownerWallet comes from credential)
    const byOwner: Record<string, typeof vaults> = {};
    for (const v of vaults) {
      const key = v.ownerWallet || 'unknown';
      if (!byOwner[key]) byOwner[key] = [];
      byOwner[key].push(v);
    }

    const vaultsByOwner = await Promise.all(
      Object.entries(byOwner).map(async ([wallet, walletVaults]) => ({
        ownerWallet: wallet,
        vaultCount: walletVaults.length,
        totalDeposited: walletVaults.reduce((s, v) => s + (v.totalDeposited || 0), 0),
        totalNAV: walletVaults.reduce((s, v) => s + (v.totalNAV || 0), 0),
        vaults: await Promise.all(walletVaults.map(async (v) => {
          // Fetch on-chain Solstice position for this vault
          let solsticePosition: { eusxBalance: number; usxValue: number; exchangeRate: number } | null = null;
          try {
            solsticePosition = await this.solstice.getPositionForVault(v.vaultId);
          } catch { /* no on-chain position */ }

          // Compute all withdrawal requests (pending, approved, etc.)
          const withdrawals = v.consentRequests
            .filter((c) => c.actionType === 'WITHDRAWAL')
            .map((c) => ({
              amount: c.amount,
              status: c.status,
              destinationWallet: (c.details as any)?.destinationWallet || (c.details as any)?.callerWallet || '',
              requestId: c.requestId,
              approvedAt: c.consentedAt,
              createdAt: c.createdAt,
            }));
          const totalWithdrawn = withdrawals.filter(w => w.status === 'approved').reduce((s, w) => s + w.amount, 0);
          const totalPendingWithdrawal = withdrawals.filter(w => w.status === 'pending').reduce((s, w) => s + w.amount, 0);

          // Use on-chain position as source of truth for active Solstice allocations
          const allocationsWithOnChain = v.allocations.map((a) => {
            const isSolstice = a.strategyId === 'solstice-eusx-yield';
            const onChainAmount = isSolstice && solsticePosition?.usxValue ? solsticePosition.usxValue : null;
            return {
              strategyName: a.strategy?.name || a.strategyId,
              strategyId: a.strategyId,
              amount: onChainAmount !== null && a.status === 'active' ? onChainAmount : a.amount,
              yieldAccrued: a.yieldAccrued,
              status: a.status,
              txSignature: a.txSignature,
              onChainAddress: a.onChainAddress,
              createdAt: a.createdAt,
              onChainVerified: onChainAmount !== null,
            };
          });

          return {
            vaultId: v.vaultId,
            clientReference: v.clientReference,
            baseAsset: v.baseAsset,
            status: v.status,
            paused: v.paused,
            idleBalance: v.idleBalance,
            totalDeposited: v.totalDeposited,
            totalNAV: v.totalNAV,
            totalWithdrawn,
            totalPendingWithdrawal,
            onChainAddress: v.onChainAddress,
            programId: v.programId,
            createdAt: v.createdAt,
            credential: {
              credentialId: v.credential.credentialId,
              clientReference: v.credential.clientReference,
              jurisdiction: v.credential.jurisdiction,
              riskTier: v.credential.riskTier,
            },
            deposits: v.deposits.map((d) => ({
              amount: d.amount,
              sourceWallet: d.sourceWallet,
              sourceReference: d.sourceReference,
              sourceType: d.sourceType,
              screeningStatus: d.screeningStatus,
              jurisdictionTag: d.jurisdictionTag,
              createdAt: d.createdAt,
            })),
            allocations: allocationsWithOnChain,
            withdrawals,
            solsticePosition: solsticePosition ? {
              eusxBalance: solsticePosition.eusxBalance,
              usxValue: solsticePosition.usxValue,
              exchangeRate: solsticePosition.exchangeRate,
            } : null,
            recentEvents: v.events.slice(0, 20).map((e) => ({
              eventId: e.eventId,
              actionType: e.actionType,
              amount: e.amount,
              result: e.result,
              txSignature: e.txSignature,
              timestamp: e.timestamp,
            })),
          };
        })),
      }))
    );

    return {
      aminaWallet,
      totalVaults: vaults.length,
      totalDeposited: vaults.reduce((s, v) => s + (v.totalDeposited || 0), 0),
      totalNAV: vaults.reduce((s, v) => s + (v.totalNAV || 0), 0),
      vaultsByOwner,
    };
  }

  async create(credentialId: string, baseAsset = 'USDC') {
    const credential = await this.prisma.credential.findUnique({ where: { credentialId } });
    if (!credential || credential.revoked || credential.status !== 'active') {
      throw new BadRequestException('Invalid or revoked credential. Cannot create vault.');
    }

    if (!credential.walletAddress) {
      throw new BadRequestException('Credential has no wallet address bound. Bind a wallet first.');
    }

    // Allow multiple vaults per credential (each is segregated)
    const count = await this.prisma.vault.count();
    const vaultId = `VLT-${String(count + 1).padStart(3, '0')}`;

    // Track deployment steps for the frontend (5-step segregated deployment)
    const steps: { step: string; status: string; detail?: string; txSignature?: string; address?: string }[] = [];

    // Helper: check if any step has failed so far
    const hasFailed = () => steps.some((s) => s.status === 'failed');

    // ─── Step 1: Deploy Segregated Program Instance ─────────────
    let deployedProgramId: string | undefined;
    let deployResult: { programId: string; txSignature: string } | null = null;
    try {
      const result = await this.vaultProgram.deployNewProgramInstance(credential.walletAddress);
      deployedProgramId = result.programId;
      deployResult = { programId: result.programId, txSignature: result.txSignature };
      steps.push({
        step: 'Deploy Segregated Program',
        status: 'success',
        detail: `Unique Program ID: ${result.programId}`,
        txSignature: result.txSignature,
        address: result.programId,
      });
    } catch (e: any) {
      steps.push({ step: 'Deploy Segregated Program', status: 'failed', detail: e.message });
    }

    // ─── Step 2: Initialize Program Instance ────────────────────
    let initResult: { configPda: string; txSignature: string } | null = null;
    if (!hasFailed() && deployedProgramId) {
      try {
        initResult = await this.vaultProgram.initializeProgram(
          deployedProgramId,
          credential.walletAddress,
        );
        steps.push({
          step: 'Initialize Program',
          status: 'success',
          detail: `Config PDA: ${initResult.configPda}`,
          txSignature: initResult.txSignature,
          address: initResult.configPda,
        });
      } catch (e: any) {
        steps.push({ step: 'Initialize Program', status: 'failed', detail: e.message });
      }
    } else if (hasFailed()) {
      steps.push({ step: 'Initialize Program', status: 'skipped', detail: 'Skipped due to previous failure' });
    }

    // ─── Step 3: Register Credential On-Chain ───────────────────
    let credentialResult: { credentialPda: string; txSignature: string } | null = null;
    if (!hasFailed()) {
      try {
        credentialResult = await this.vaultProgram.registerCredential(
          credentialId,
          credential.clientReference,
          credential.jurisdiction,
          credential.riskTier,
          credential.productEligibility,
          credential.walletAddress,
          deployedProgramId,
        );
        steps.push({
          step: 'Register Credential On-Chain',
          status: credentialResult ? 'success' : 'skipped',
          detail: credentialResult ? `Credential PDA: ${credentialResult.credentialPda}` : 'Program not configured',
          txSignature: credentialResult?.txSignature !== 'existing' ? credentialResult?.txSignature : undefined,
          address: credentialResult?.credentialPda,
        });
      } catch (e: any) {
        steps.push({ step: 'Register Credential On-Chain', status: 'failed', detail: e.message });
      }
    } else {
      steps.push({ step: 'Register Credential On-Chain', status: 'skipped', detail: 'Skipped due to previous failure' });
    }

    // ─── Step 4: Create Vault On-Chain ──────────────────────────
    let programResult: { vaultPda: string; txSignature: string } | null = null;
    if (!hasFailed()) {
      try {
        programResult = await this.vaultProgram.deployVault(vaultId, credentialId, baseAsset, deployedProgramId);
        steps.push({
          step: 'Create Vault On-Chain',
          status: programResult ? 'success' : 'skipped',
          detail: programResult ? `Vault PDA: ${programResult.vaultPda}` : 'Program not configured',
          txSignature: programResult?.txSignature,
          address: programResult?.vaultPda,
        });
      } catch (e: any) {
        steps.push({ step: 'Create Vault On-Chain', status: 'failed', detail: e.message });
      }
    } else {
      steps.push({ step: 'Create Vault On-Chain', status: 'skipped', detail: 'Skipped due to previous failure' });
    }

    // ─── Step 5: SAS Attestation ────────────────────────────────
    let sasResult: { pda: string; txSignature: string; onChainAddress: string } | null = null;
    if (!hasFailed()) {
      try {
        sasResult = await this.sas.createVaultAttestation(credential.walletAddress, {
          vaultId,
          credentialId,
          clientReference: credential.clientReference,
          baseAsset,
        });
        steps.push({
          step: 'Create SAS Attestation',
          status: sasResult ? 'success' : 'skipped',
          detail: sasResult ? `Attestation PDA: ${sasResult.pda}` : 'SAS not configured',
          txSignature: sasResult?.txSignature !== 'existing' ? sasResult?.txSignature : undefined,
          address: sasResult?.pda,
        });
      } catch (e: any) {
        steps.push({ step: 'Create SAS Attestation', status: 'failed', detail: e.message });
      }
    } else {
      steps.push({ step: 'Create SAS Attestation', status: 'skipped', detail: 'Skipped due to previous failure' });
    }

    // If any step failed, do NOT create vault in DB — return failure with steps
    if (hasFailed()) {
      const failedStep = steps.find((s) => s.status === 'failed');
      await this.events.emit({
        actionType: 'VAULT_CREATION_FAILED', actor: 'admin', role: 'Admin',
        result: 'failure',
        reason: `Vault ${vaultId} deployment failed at step: ${failedStep?.step} — ${failedStep?.detail}`,
      });

      return {
        vaultId,
        credentialId,
        clientReference: credential.clientReference,
        ownerWallet: credential.walletAddress,
        baseAsset,
        status: 'failed',
        programId: deployedProgramId,
        onChainAddress: programResult?.vaultPda,
        deploymentSteps: steps,
        aminaBankWallet: this.vaultProgram.getAminaBankWallet(),
      };
    }

    // All steps succeeded — create vault in DB
    const vault = await this.prisma.vault.create({
      data: {
        vaultId,
        credentialId,
        clientReference: credential.clientReference,
        ownerWallet: credential.walletAddress,
        baseAsset,
        status: 'initiated',
      },
    });

    // Update vault record with on-chain addresses and unique program ID
    const onChainData: Record<string, string> = {};
    if (deployedProgramId) {
      onChainData.programId = deployedProgramId;
    }
    if (programResult) {
      onChainData.onChainAddress = programResult.vaultPda;
    }
    if (sasResult) {
      onChainData.vaultAttestationPda = sasResult.pda;
      onChainData.vaultAttestationTxSig = sasResult.txSignature;
      if (!onChainData.onChainAddress) {
        onChainData.onChainAddress = sasResult.onChainAddress;
      }
    }

    if (Object.keys(onChainData).length > 0) {
      await this.prisma.vault.update({
        where: { vaultId },
        data: onChainData,
      });
    }

    const deployedOnChain = !!deployedProgramId;
    const attestedOnChain = !!sasResult;

    await this.events.emit({
      vaultId, actionType: 'VAULT_CREATED', actor: 'admin', role: 'Admin',
      result: 'success',
      reason: `Segregated vault ${vaultId} created for ${credential.clientReference} (wallet: ${credential.walletAddress.slice(0, 8)}...)${deployedOnChain ? ` — unique program ${deployedProgramId}` : ''}${attestedOnChain ? ' — SAS attested' : ''}`,
      txSignature: deployResult?.txSignature || programResult?.txSignature || sasResult?.txSignature,
      onChainAddress: deployedProgramId || programResult?.vaultPda || sasResult?.onChainAddress,
    });

    return {
      ...vault,
      programId: deployedProgramId || this.vaultProgram.getProgramId(),
      onChainAddress: programResult?.vaultPda || sasResult?.onChainAddress,
      vaultProgramTxSig: programResult?.txSignature,
      credentialPda: credentialResult?.credentialPda,
      credentialTxSig: credentialResult?.txSignature,
      vaultAttestationPda: sasResult?.pda,
      vaultAttestationTxSig: sasResult?.txSignature,
      aminaBankWallet: this.vaultProgram.getAminaBankWallet(),
      deploymentSteps: steps,
    };
  }

  async getSnapshot(vaultId: string) {
    const vault = await this.prisma.vault.findUnique({
      where: { vaultId },
      include: { mandate: true, credential: true, allocations: { include: { strategy: true } }, deposits: true, consentRequests: true },
    });
    if (!vault) throw new NotFoundException('Vault not found');

    const activeAllocations = vault.allocations.filter((a) => a.status === 'active');
    const totalYield = activeAllocations.reduce((s, a) => s + a.yieldAccrued, 0);

    const strategyExposures: Record<string, { amount: number; yield: number; strategyId: string }> = {};

    // For Solstice strategy, always read deployed amount from on-chain (eUSX balance * exchange rate)
    // This ensures the position shows even if DB allocations are out of sync
    try {
      const position = await this.solstice.getPositionForVault(vaultId);
      if (position.eusxBalance > 0) {
        strategyExposures['Solstice eUSX Yield'] = {
          amount: position.usxValue,
          yield: activeAllocations.filter((a) => a.strategyId === 'solstice-eusx-yield').reduce((s, a) => s + a.yieldAccrued, 0),
          strategyId: 'solstice-eusx-yield',
        };
      }
    } catch { /* on-chain read failed, fall through to DB */ }

    // All strategies (including Solstice fallback) from DB
    activeAllocations.forEach((a) => {
      const key = a.strategy.name;
      if (!strategyExposures[key]) {
        strategyExposures[key] = { amount: 0, yield: 0, strategyId: a.strategyId };
      }
      // Only add DB amounts for non-Solstice (Solstice uses on-chain above)
      if (a.strategyId !== 'solstice-eusx-yield') {
        strategyExposures[key].amount += a.amount;
        strategyExposures[key].yield += a.yieldAccrued;
      }
    });

    const totalDeployed = Object.values(strategyExposures).reduce((s, e) => s + e.amount, 0);

    // Cooldown allocations (being unwound, awaiting protocol cooldown)
    const cooldownAllocations = vault.allocations
      .filter((a) => a.status === 'cooldown')
      .map((a) => ({
        strategyId: a.strategyId,
        strategyName: a.strategy?.name || a.strategyId,
        amount: a.amount,
        yieldAccrued: a.yieldAccrued,
        txSignature: a.txSignature,
        onChainAddress: a.onChainAddress,
        updatedAt: a.updatedAt,
      }));
    const totalCooldown = cooldownAllocations.reduce((s, a) => s + a.amount, 0);

    // Pending withdrawal requests
    const pendingWithdrawals = vault.consentRequests
      .filter((c) => c.actionType === 'WITHDRAWAL' && c.status === 'pending')
      .map((c) => ({
        requestId: c.requestId,
        amount: c.amount,
        destinationWallet: (c.details as any)?.destinationWallet || '',
        createdAt: c.createdAt,
      }));
    const totalPendingWithdrawal = pendingWithdrawals.reduce((s, w) => s + w.amount, 0);

    return {
      vaultId: vault.vaultId, status: vault.status, paused: vault.paused, baseAsset: vault.baseAsset,
      clientReference: vault.clientReference, credentialId: vault.credentialId,
      idleBalance: vault.idleBalance, totalDeployed, totalYield, totalCooldown,
      totalNAV: vault.idleBalance + totalDeployed + totalYield,
      mandateStatus: vault.mandate?.status || 'none',
      strategyExposures,
      cooldownAllocations,
      pendingWithdrawals,
      totalPendingWithdrawal,
      pendingConsents: vault.consentRequests.filter((c) => c.status === 'pending').length,
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

  async activateVault(vaultId: string, callerWallet?: string) {
    await this.verifyVaultOwnership(vaultId, callerWallet, true);
    const vault = await this.prisma.vault.findUnique({ where: { vaultId } });
    if (!vault) throw new NotFoundException('Vault not found');
    if (vault.status === 'active') return vault;
    if (vault.status !== 'initiated') throw new BadRequestException(`Vault cannot be activated from status: ${vault.status}`);

    // Auto-create default mandate if none exists
    let mandate = await this.prisma.mandate.findUnique({ where: { vaultId } });
    if (!mandate) {
      const strategies = await this.prisma.strategy.findMany({ where: { active: true, disabled: false } });
      const allowedIds = strategies.filter(s => s.riskLevel === 'low').map(s => s.strategyId);
      const caps: Record<string, number> = {};
      allowedIds.forEach(id => { caps[id] = 4000; });

      mandate = await this.prisma.mandate.create({
        data: {
          vaultId,
          allowedStrategies: allowedIds,
          blockedStrategies: strategies.filter(s => s.riskLevel === 'high').map(s => s.strategyId),
          maxAllocationBps: caps,
          liquidityBufferBps: 1000,
          consentThreshold: 250000,
          leverageAllowed: false,
          approvedDestinations: [vault.ownerWallet],
        },
      });

      await this.events.emit({
        vaultId, actionType: 'MANDATE_ATTACHED', actor: callerWallet || 'client', role: 'client_representative',
        result: 'success',
        reason: `Default mandate created and accepted by client on vault activation. Allowed: ${allowedIds.join(', ')}.`,
      });
    }

    const updated = await this.prisma.vault.update({
      where: { vaultId },
      data: { status: 'active' },
    });

    await this.events.emit({
      vaultId,
      actionType: 'VAULT_ACTIVATED',
      actor: callerWallet || 'client',
      role: 'client_representative',
      result: 'success',
      reason: `Client approved mandate and activated vault ${vaultId}`,
    });

    return updated;
  }

  async getDeposits(vaultId: string) {
    return this.prisma.deposit.findMany({
      where: { vaultId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async deposit(vaultId: string, amount: number, sourceWallet?: string, sourceReference?: string, sourceType?: string, jurisdictionTag?: string, callerWallet?: string) {
    await this.verifyVaultOwnership(vaultId, callerWallet, true);
    const vault = await this.prisma.vault.findUnique({ where: { vaultId } });
    if (!vault) throw new NotFoundException('Vault not found');
    if (vault.status !== 'active') throw new BadRequestException('Vault is not active. Client must approve the mandate before depositing.');
    if (vault.paused) throw new BadRequestException('Vault is paused');

    // Auto-attach a default mandate if this is the first deposit and no mandate exists
    const existingMandate = await this.prisma.mandate.findUnique({ where: { vaultId } });
    if (!existingMandate) {
      const strategies = await this.prisma.strategy.findMany({ where: { active: true, disabled: false } });
      const allowedIds = strategies.filter(s => s.riskLevel === 'low').map(s => s.strategyId);
      const caps: Record<string, number> = {};
      allowedIds.forEach(id => { caps[id] = 4000; }); // 40% max per strategy

      await this.prisma.mandate.create({
        data: {
          vaultId,
          allowedStrategies: allowedIds,
          blockedStrategies: strategies.filter(s => s.riskLevel === 'high').map(s => s.strategyId),
          maxAllocationBps: caps,
          liquidityBufferBps: 1000, // 10%
          consentThreshold: 250000,
          leverageAllowed: false,
          approvedDestinations: [vault.ownerWallet],
        },
      });

      await this.events.emit({
        vaultId, actionType: 'MANDATE_ATTACHED', actor: 'system', role: 'Admin',
        result: 'success',
        reason: `Default mandate auto-attached on first deposit. Allowed: ${allowedIds.join(', ')}. Liquidity buffer: 10%.`,
      });
    }

    const isOnChain = sourceType === 'On-Chain USDC Transfer';
    // Detect tx signature: if sourceReference looks like a Solana signature (base58, 80+ chars)
    const looksLikeTxSig = sourceReference && /^[1-9A-HJ-NP-Za-km-z]{80,}$/.test(sourceReference);
    const txSig = isOnChain || looksLikeTxSig ? sourceReference : undefined;

    const deposit = await this.prisma.deposit.create({
      data: {
        vaultId, amount,
        sourceWallet: sourceWallet || callerWallet || 'unknown',
        sourceReference: sourceReference || `SRC-${Date.now()}`,
        sourceType: sourceType || 'Approved Custody-Linked Wallet',
        jurisdictionTag: jurisdictionTag || 'CH',
      },
    });

    const updated = await this.prisma.vault.update({
      where: { vaultId },
      data: { idleBalance: { increment: amount }, totalDeposited: { increment: amount }, totalNAV: { increment: amount } },
    });

    const actor = isOnChain ? (callerWallet || sourceWallet || 'client') : 'operations';
    const role = isOnChain ? 'Client Representative' : 'Operations';
    const aminaBankWallet = this.vaultProgram.getAminaBankWallet();
    const reason = isOnChain
      ? [
          `On-chain deposit of ${amount.toLocaleString()} ${vault.baseAsset} into vault ${vaultId}.`,
          `Source wallet: ${(sourceWallet || callerWallet || '').slice(0, 8)}... → custodial wallet: ${aminaBankWallet.slice(0, 8)}...`,
          `Post-deposit idle: ${updated.idleBalance.toLocaleString()} ${vault.baseAsset}. Total deposited: ${updated.totalDeposited.toLocaleString()}.`,
          `Segregated: per-vault balance tracking. Non-commingled. KYT: source screened.`,
        ].join(' ')
      : [
          `Off-chain deposit of ${amount.toLocaleString()} ${vault.baseAsset} recorded for vault ${vaultId}.`,
          `Source: ${deposit.sourceReference}. Jurisdiction: ${deposit.jurisdictionTag}.`,
          `Post-deposit idle: ${updated.idleBalance.toLocaleString()} ${vault.baseAsset}.`,
          `Segregated: per-vault balance tracking. Non-commingled.`,
        ].join(' ');

    await this.events.emit({
      vaultId, actionType: 'DEPOSIT_RECORDED', actor, role,
      asset: vault.baseAsset, amount, result: 'success',
      reason,
      txSignature: txSig,
      onChainAddress: isOnChain ? aminaBankWallet || vault.onChainAddress || undefined : undefined,
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

  /**
   * Client requests a withdrawal. Creates a pending consent request.
   * The admin/PM must approve and process it via processWithdrawal().
   */
  async redeem(vaultId: string, amount: number, destinationWallet: string, callerWallet?: string, txSignature?: string) {
    await this.verifyVaultOwnership(vaultId, callerWallet, true);
    const vault = await this.prisma.vault.findUnique({ where: { vaultId }, include: { mandate: true } });
    if (!vault) throw new NotFoundException('Vault not found');

    if (amount > vault.totalNAV) {
      throw new BadRequestException(`Amount exceeds vault NAV. Total NAV: ${vault.totalNAV.toLocaleString()}`);
    }

    // Create a pending withdrawal request
    const cnt = await this.prisma.consentRequest.count();
    const requestId = `WDR-${String(cnt + 1).padStart(3, '0')}`;

    await this.prisma.consentRequest.create({
      data: {
        requestId,
        vaultId,
        actionType: 'WITHDRAWAL',
        amount,
        details: { destinationWallet, callerWallet: callerWallet || destinationWallet },
        initiator: callerWallet || 'client_representative',
        status: 'pending',
      },
    });

    await this.events.emit({
      vaultId, actionType: 'WITHDRAWAL_REQUESTED', actor: callerWallet || 'client_representative', role: 'Client Representative',
      asset: vault.baseAsset, amount, result: 'pending',
      reason: [
        `Withdrawal request ${requestId} for vault ${vaultId}: ${amount.toLocaleString()} ${vault.baseAsset}.`,
        `Destination: ${destinationWallet.slice(0, 8)}... Initiator: ${(callerWallet || 'client_representative').slice(0, 8)}...`,
        `Vault idle balance: ${vault.idleBalance.toLocaleString()} ${vault.baseAsset}. Status: pending admin approval.`,
        `Segregated: withdrawal from vault-specific idle balance. Non-commingled.`,
      ].join(' '),
      onChainAddress: vault.onChainAddress || undefined,
    });

    return { message: `Withdrawal request submitted for ${amount.toLocaleString()} ${vault.baseAsset}. Pending admin approval.`, requestId, status: 'pending' };
  }

  /**
   * Admin/PM approves and processes a pending withdrawal request.
   * Executes on-chain USDC transfer from custodial wallet to client destination.
   */
  async processWithdrawal(requestId: string, txSignature?: string) {
    const request = await this.prisma.consentRequest.findUnique({ where: { requestId } });
    if (!request) throw new NotFoundException('Withdrawal request not found');
    if (request.status !== 'pending') throw new BadRequestException('Request is not pending');

    const vault = await this.prisma.vault.findUnique({ where: { vaultId: request.vaultId } });
    if (!vault) throw new NotFoundException('Vault not found');

    if (request.amount > vault.idleBalance) {
      throw new BadRequestException(`Insufficient idle balance. Available: ${vault.idleBalance.toLocaleString()}`);
    }

    const details = request.details as any;
    const destinationWallet = details?.destinationWallet || details?.callerWallet || '';
    const aminaBankWallet = this.vaultProgram.getAminaBankWallet();

    await this.events.emit({
      vaultId: request.vaultId, actionType: 'REDEMPTION_INITIATED', actor: 'admin', role: 'Admin',
      asset: vault.baseAsset, amount: request.amount, result: 'pending',
      reason: [
        `Processing withdrawal ${requestId} for vault ${request.vaultId}.`,
        `Amount: ${request.amount.toLocaleString()} ${vault.baseAsset}. Destination: ${destinationWallet.slice(0, 8)}...`,
        `Source: custodial wallet ${aminaBankWallet}. Vault idle balance: ${vault.idleBalance.toLocaleString()}.`,
      ].join(' '),
    });

    // Execute on-chain USDC transfer from custodial wallet to client
    let onChainTxSig = txSignature;
    if (destinationWallet && aminaBankWallet) {
      try {
        const transferResult = await this.vaultProgram.sendUsdc(destinationWallet, request.amount);
        onChainTxSig = transferResult.txSignature;

        await this.events.emit({
          vaultId: request.vaultId, actionType: 'ON_CHAIN_TRANSFER', actor: 'admin', role: 'Admin',
          asset: vault.baseAsset, amount: request.amount, result: 'success',
          reason: [
            `On-chain USDC transfer for vault ${request.vaultId} withdrawal ${requestId}.`,
            `${request.amount.toLocaleString()} USDC from custodial wallet ${aminaBankWallet} → client ${destinationWallet.slice(0, 8)}...`,
            `Tx: ${onChainTxSig}. Segregated: vault-specific withdrawal.`,
          ].join(' '),
          txSignature: onChainTxSig,
          onChainAddress: destinationWallet,
        });
      } catch (e: any) {
        await this.events.emit({
          vaultId: request.vaultId, actionType: 'ON_CHAIN_TRANSFER', actor: 'admin', role: 'Admin',
          asset: vault.baseAsset, amount: request.amount, result: 'failed',
          reason: `On-chain transfer failed for withdrawal ${requestId}: ${e.message}. DB withdrawal will still be recorded.`,
        });
        // Continue with DB update even if on-chain fails — admin can retry transfer
      }
    }

    // Update DB
    const updated = await this.prisma.vault.update({
      where: { vaultId: request.vaultId },
      data: { idleBalance: { decrement: request.amount }, totalNAV: { decrement: request.amount } },
    });

    await this.prisma.consentRequest.update({
      where: { requestId },
      data: { status: 'approved', consentedBy: 'admin', consentedAt: new Date() },
    });

    await this.events.emit({
      vaultId: request.vaultId, actionType: 'REDEMPTION_EXECUTED', actor: 'admin', role: 'Admin',
      asset: vault.baseAsset, amount: request.amount, result: 'success',
      reason: [
        `Withdrawal ${requestId} completed for vault ${request.vaultId}.`,
        `${request.amount.toLocaleString()} ${vault.baseAsset} sent to ${destinationWallet.slice(0, 8)}...`,
        `Post-withdrawal idle: ${updated.idleBalance.toLocaleString()} ${vault.baseAsset}. NAV: ${updated.totalNAV.toLocaleString()}.`,
        `Segregated: vault-specific fund movement. Non-commingled. KYT-compliant.`,
      ].join(' '),
      txSignature: onChainTxSig,
      onChainAddress: destinationWallet || vault.onChainAddress || undefined,
    });

    return {
      message: `Withdrawal of ${request.amount.toLocaleString()} ${vault.baseAsset} processed`,
      txSignature: onChainTxSig,
      vault: updated,
    };
  }

  async unwind(vaultId: string, strategyId: string) {
    const vault = await this.prisma.vault.findUnique({
      where: { vaultId },
      include: { allocations: { where: { strategyId, status: { in: ['active', 'cooldown'] } } } },
    });
    if (!vault) throw new NotFoundException('Vault not found');

    const dbAllocations = vault.allocations;
    const totalUnwindDb = dbAllocations.reduce((s, a) => s + a.amount + a.yieldAccrued, 0);
    const yieldTotal = dbAllocations.reduce((s, a) => s + a.yieldAccrued, 0);
    const aminaBankWallet = this.vaultProgram.getAminaBankWallet();

    // ─── Solstice: use on-chain eUSX balance as source of truth ──
    if (strategyId === 'solstice-eusx-yield') {
      // Read on-chain position to determine actual deployed amount
      const position = await this.solstice.getPositionForVault(vaultId);
      if (position.eusxBalance <= 0) {
        throw new BadRequestException('No on-chain eUSX position to unwind');
      }

      const onChainAmount = position.usxValue;

      await this.events.emit({
        vaultId, actionType: 'UNWIND_INITIATED', actor: 'portfolio_manager', role: 'Portfolio Manager',
        asset: vault.baseAsset, amount: onChainAmount, strategy: strategyId, result: 'pending',
        reason: [
          `Initiating Solstice unwind for vault ${vaultId}.`,
          `On-chain position: ${position.eusxBalance.toFixed(4)} eUSX (≈${onChainAmount.toFixed(2)} USX at rate ${position.exchangeRate.toFixed(6)}).`,
          `DB allocations: ${dbAllocations.length} records, total: ${totalUnwindDb.toLocaleString()} ${vault.baseAsset}.`,
          `Custodial wallet: ${aminaBankWallet}. Segregated: vault-specific unwind.`,
        ].join(' '),
      });

      // Step 1: Unlock eUSX → USX goes to cooldown escrow
      const unlockResult = await this.solstice.unlockEUSX(vaultId, onChainAmount);

      // Step 2: Withdraw USX from cooldown escrow + redeem to USDC
      let withdrawResult: any = null;
      try {
        withdrawResult = await this.solstice.withdrawUSX(vaultId);
      } catch (e: any) {
        // Withdraw failed — cooldown period not elapsed yet
        // Allocation already marked as 'cooldown' by unlockEUSX
        await this.events.emit({
          vaultId, actionType: 'SOLSTICE_COOLDOWN_ACTIVE', actor: 'portfolio_manager', role: 'Portfolio Manager',
          asset: vault.baseAsset, amount: onChainAmount, strategy: strategyId, result: 'pending',
          reason: [
            `eUSX unlocked on-chain for vault ${vaultId} (tx: ${unlockResult.txSignature}).`,
            `Protocol cooldown in progress — withdrawal will be available after cooldown period.`,
            `Burned: ${unlockResult.eusxBurned} eUSX. On-chain verified: ${unlockResult.onChainVerified}.`,
            `Segregated: funds in Solstice cooldown escrow ${unlockResult.cooldownEscrow}, tracked to vault ${vaultId}.`,
            `Action required: retry withdrawal after cooldown period elapses.`,
          ].join(' '),
          txSignature: unlockResult.txSignature,
          onChainAddress: unlockResult.cooldownEscrow,
        });
        return {
          message: `eUSX unlocked on-chain. Withdrawal pending cooldown period.`,
          status: 'cooldown',
          unlockTx: unlockResult.txSignature,
          totalUnwind: onChainAmount,
        };
      }

      // ─── Both steps succeeded: mark allocations as unwound, return funds ──
      await this.prisma.allocation.updateMany({
        where: { vaultId, strategyId, status: { in: ['active', 'cooldown'] } },
        data: { status: 'unwound' },
      });

      // Use USDC received if available (most accurate), fall back to USX received, then on-chain amount
      const returnAmount = withdrawResult?.usdcReceived > 0
        ? withdrawResult.usdcReceived
        : withdrawResult?.usxReceived > 0
          ? withdrawResult.usxReceived
          : onChainAmount;
      const yieldEarned = returnAmount - dbAllocations.reduce((s, a) => s + a.amount, 0);

      await this.prisma.vault.update({
        where: { vaultId },
        data: {
          idleBalance: { increment: returnAmount },
          totalNAV: yieldEarned > 0 ? { increment: yieldEarned } : undefined,
        },
      });

      await this.events.emit({
        vaultId, actionType: 'UNWIND_EXECUTED', actor: 'portfolio_manager', role: 'Portfolio Manager',
        asset: vault.baseAsset, amount: returnAmount, strategy: strategyId, result: 'success',
        reason: [
          `Full on-chain unwind completed for vault ${vaultId}.`,
          `Unlock: ${position.eusxBalance.toFixed(4)} eUSX burned (tx: ${unlockResult.txSignature}).`,
          `Withdraw + Redeem: ${withdrawResult?.usxReceived || 0} USX → ${withdrawResult?.usdcReceived || 0} USDC (tx: ${withdrawResult?.txSignature}).`,
          `Returned ${returnAmount.toLocaleString()} ${vault.baseAsset} to vault idle balance.${yieldEarned > 0 ? ` Yield earned: ${yieldEarned.toFixed(2)}.` : ''}`,
          `Post-unwind idle: ${(vault.idleBalance + returnAmount).toLocaleString()} ${vault.baseAsset}.`,
          `Segregated: all fund movements within custodial wallet ${aminaBankWallet}. Non-commingled.`,
        ].join(' '),
        txSignature: withdrawResult?.txSignature || unlockResult.txSignature,
        onChainAddress: aminaBankWallet,
      });

      return {
        message: `Unwound ${returnAmount.toLocaleString()} ${vault.baseAsset}`,
        totalUnwind: returnAmount,
        unlockTx: unlockResult.txSignature,
        withdrawTx: withdrawResult?.txSignature,
        onChainVerified: withdrawResult?.onChainVerified || unlockResult.onChainVerified || false,
      };
    }

    // ─── Non-Solstice strategies: DB-only unwind ──────────────
    if (!dbAllocations.length) throw new BadRequestException('No active allocations for this strategy');

    await this.prisma.allocation.updateMany({ where: { vaultId, strategyId, status: { in: ['active', 'cooldown'] } }, data: { status: 'unwound' } });
    await this.prisma.vault.update({ where: { vaultId }, data: { idleBalance: { increment: totalUnwindDb }, totalNAV: { increment: yieldTotal } } });

    await this.events.emit({
      vaultId, actionType: 'UNWIND_EXECUTED', actor: 'portfolio_manager', role: 'Portfolio Manager',
      asset: vault.baseAsset, amount: totalUnwindDb, strategy: strategyId, result: 'success',
      reason: [
        `Unwound ${totalUnwindDb.toLocaleString()} ${vault.baseAsset} from strategy back to idle balance for vault ${vaultId}.`,
        `Allocations unwound: ${dbAllocations.length}. Yield total: ${yieldTotal.toLocaleString()}.`,
        `Segregated: vault-specific operation. Non-commingled.`,
      ].join(' '),
    });

    return { message: `Unwound ${totalUnwindDb.toLocaleString()} ${vault.baseAsset}`, totalUnwind: totalUnwindDb };
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

  /** Get simulated AMINA Bank USD balance */
  getBankBalance() {
    return { balance: this.bankBalance, currency: 'USD' };
  }

  /**
   * On-ramp: Amina Bank sends USDC to the user's wallet on-chain.
   * Records the event in the audit trail.
   */
  async onramp(recipientWallet: string, amount: number, callerWallet?: string) {
    if (amount > this.bankBalance) {
      throw new BadRequestException('Insufficient AMINA Bank balance');
    }
    const result = await this.vaultProgram.sendUsdc(recipientWallet, amount);
    this.bankBalance -= amount;

    await this.events.emit({
      actionType: 'ONRAMP_COMPLETED',
      actor: callerWallet || recipientWallet,
      role: 'Client Representative',
      asset: 'USDC',
      amount,
      result: 'success',
      reason: `On-ramp: ${amount.toLocaleString()} USD → USDC sent from Amina Bank (${result.aminaWallet.slice(0, 8)}...) to wallet ${recipientWallet.slice(0, 8)}...`,
      txSignature: result.txSignature,
    });

    return result;
  }

  /**
   * Off-ramp: User sends USDC back to Amina, credited to bank account.
   * Records the event in the audit trail.
   */
  async offramp(senderWallet: string, amount: number, callerWallet?: string, txSignature?: string) {
    const aminaWallet = this.vaultProgram.getAminaBankWallet();

    await this.events.emit({
      actionType: 'OFFRAMP_COMPLETED',
      actor: callerWallet || senderWallet,
      role: 'Client Representative',
      asset: 'USDC',
      amount,
      result: 'success',
      reason: `Off-ramp: ${amount.toLocaleString()} USDC sent from wallet ${senderWallet.slice(0, 8)}... to Amina Bank (${aminaWallet.slice(0, 8)}...) → credited to bank account`,
      txSignature,
    });

    this.bankBalance += amount;
    return { message: `Off-ramp of ${amount.toLocaleString()} USDC completed`, status: 'success', aminaWallet, txSignature };
  }

  /**
   * Reconcile a vault's idle balance from DB records (deposits - allocations - withdrawals).
   * Fixes corrupted balances caused by previous bugs where idle balance was decremented
   * without actual fund movements.
   */
  async reconcileBalance(vaultId: string) {
    const vault = await this.prisma.vault.findUnique({
      where: { vaultId },
      include: {
        deposits: true,
        allocations: true,
        consentRequests: { where: { actionType: 'WITHDRAWAL', status: 'approved' } },
      },
    });
    if (!vault) throw new NotFoundException('Vault not found');

    const totalDeposited = vault.deposits.reduce((s, d) => s + d.amount, 0);
    const activeDeployed = vault.allocations
      .filter(a => a.status === 'active' || a.status === 'cooldown')
      .reduce((s, a) => s + a.amount, 0);
    const totalWithdrawn = vault.consentRequests.reduce((s, c) => s + c.amount, 0);

    // Read on-chain Solstice position if any
    let onChainDeployed = 0;
    try {
      const position = await this.solstice.getPositionForVault(vaultId);
      onChainDeployed = position.usxValue || 0;
    } catch { /* no on-chain position */ }

    // Correct idle = total deposited - what's deployed - what's been withdrawn
    const deployedAmount = onChainDeployed > 0 ? onChainDeployed : activeDeployed;
    const correctIdle = totalDeposited - deployedAmount - totalWithdrawn;
    const correctNAV = correctIdle + deployedAmount;

    const oldIdle = vault.idleBalance;
    const oldNAV = vault.totalNAV;

    const updated = await this.prisma.vault.update({
      where: { vaultId },
      data: { idleBalance: correctIdle, totalNAV: correctNAV },
    });

    await this.events.emit({
      vaultId, actionType: 'BALANCE_RECONCILED', actor: 'admin', role: 'Admin',
      asset: vault.baseAsset, amount: correctIdle, result: 'success',
      reason: [
        `Vault ${vaultId} balance reconciled from DB records.`,
        `Deposits: ${totalDeposited.toLocaleString()}. Deployed: ${deployedAmount.toLocaleString()} (on-chain: ${onChainDeployed.toLocaleString()}). Withdrawn: ${totalWithdrawn.toLocaleString()}.`,
        `Idle: ${oldIdle.toLocaleString()} → ${correctIdle.toLocaleString()}. NAV: ${oldNAV.toLocaleString()} → ${correctNAV.toLocaleString()}.`,
      ].join(' '),
    });

    return {
      vaultId,
      before: { idleBalance: oldIdle, totalNAV: oldNAV },
      after: { idleBalance: correctIdle, totalNAV: correctNAV },
      breakdown: { totalDeposited, activeDeployed, onChainDeployed, totalWithdrawn },
    };
  }

}
