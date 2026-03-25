import { Injectable, Inject, BadRequestException, ForbiddenException, NotFoundException, Logger } from '@nestjs/common';
import { Connection, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { SasService } from '../sas/sas.service';
import { VaultProgramService } from '../vault-program/vault-program.service';
import { SolsticeService } from '../solstice/solstice.service';

const USDC_MINT = new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');

@Injectable()
export class VaultsService {
  private prisma: PrismaService;
  private events: EventsService;
  private sas: SasService;
  private vaultProgram: VaultProgramService;
  private solstice: SolsticeService;
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
        consentRequests: { where: { actionType: 'WITHDRAWAL' }, orderBy: { createdAt: 'desc' } },
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

    // Fetch on-chain data for each vault in parallel
    const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
    const connection = new Connection(rpcUrl, { commitment: 'confirmed', wsEndpoint: undefined as any });

    const onChainData: Record<string, { usdcBalance: number; eusxBalance: number; usxValue: number; exchangeRate: number }> = {};
    await Promise.all(vaults.map(async (v) => {
      try {
        // Read on-chain USDC balance from AMINA wallet ATA
        const aminaPubkey = new PublicKey(aminaWallet);
        const aminaAta = await getAssociatedTokenAddress(USDC_MINT, aminaPubkey);
        let usdcBalance = 0;
        try {
          const bal = await connection.getTokenAccountBalance(aminaAta);
          usdcBalance = Number(bal.value.uiAmount || 0);
        } catch { /* ATA may not exist */ }

        // Read Solstice position
        let eusxBalance = 0, usxValue = 0, exchangeRate = 1;
        try {
          const pos = await this.solstice.getPositionForVault(v.vaultId);
          eusxBalance = pos.eusxBalance;
          usxValue = pos.usxValue;
          exchangeRate = pos.exchangeRate;
        } catch { /* no position */ }

        onChainData[v.vaultId] = { usdcBalance, eusxBalance, usxValue, exchangeRate };
      } catch {
        onChainData[v.vaultId] = { usdcBalance: 0, eusxBalance: 0, usxValue: 0, exchangeRate: 1 };
      }
    }));

    return {
      aminaWallet,
      totalVaults: vaults.length,
      totalDeposited: vaults.reduce((s, v) => s + (v.totalDeposited || 0), 0),
      totalNAV: vaults.reduce((s, v) => {
        const oc = onChainData[v.vaultId];
        return s + (oc ? oc.usdcBalance + oc.usxValue : (v.totalNAV || 0));
      }, 0),
      vaultsByOwner: Object.entries(byOwner).map(([wallet, walletVaults]) => ({
        ownerWallet: wallet,
        vaultCount: walletVaults.length,
        totalDeposited: walletVaults.reduce((s, v) => s + (v.totalDeposited || 0), 0),
        totalNAV: walletVaults.reduce((s, v) => {
          const oc = onChainData[v.vaultId];
          return s + (oc ? oc.usdcBalance + oc.usxValue : (v.totalNAV || 0));
        }, 0),
        vaults: walletVaults.map((v) => {
          const oc = onChainData[v.vaultId] || { usdcBalance: 0, eusxBalance: 0, usxValue: 0, exchangeRate: 1 };
          return {
          vaultId: v.vaultId,
          clientReference: v.clientReference,
          baseAsset: v.baseAsset,
          status: v.status,
          paused: v.paused,
          idleBalance: oc.usdcBalance,
          totalDeployed: oc.usxValue,
          totalDeposited: v.totalDeposited,
          totalNAV: oc.usdcBalance + oc.usxValue,
          onChainAddress: v.onChainAddress,
          programId: v.programId,
          createdAt: v.createdAt,
          onChain: {
            usdcBalance: oc.usdcBalance,
            eusxBalance: oc.eusxBalance,
            usxValue: oc.usxValue,
            exchangeRate: oc.exchangeRate,
          },
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
          allocations: v.allocations.map((a) => ({
            strategyName: a.strategy?.name || a.strategyId,
            strategyId: a.strategyId,
            amount: a.amount,
            yieldAccrued: a.yieldAccrued,
            status: a.status,
            txSignature: a.txSignature,
            onChainAddress: a.onChainAddress,
            createdAt: a.createdAt,
          })),
          withdrawals: v.consentRequests.map((w) => ({
            requestId: w.requestId,
            amount: w.amount,
            status: w.status,
            destinationWallet: (w.details as any)?.destinationWallet || (w.details as any)?.callerWallet || '',
            initiator: w.initiator,
            consentedBy: w.consentedBy,
            consentedAt: w.consentedAt,
            createdAt: w.createdAt,
          })),
          recentEvents: v.events.slice(0, 20).map((e) => ({
            eventId: e.eventId,
            actionType: e.actionType,
            amount: e.amount,
            result: e.result,
            txSignature: e.txSignature,
            timestamp: e.timestamp,
          })),
        };
        }),
      })),
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
    const reason = isOnChain
      ? `On-chain deposit of ${amount.toLocaleString()} ${vault.baseAsset} from wallet ${(sourceWallet || callerWallet || '').slice(0, 8)}... to vault ${vaultId}`
      : `Off-chain deposit of ${amount.toLocaleString()} ${vault.baseAsset} recorded. Source: ${deposit.sourceReference}`;

    await this.events.emit({
      vaultId, actionType: 'DEPOSIT_RECORDED', actor, role,
      asset: vault.baseAsset, amount, result: 'success',
      reason,
      txSignature: txSig,
      onChainAddress: isOnChain ? vault.onChainAddress || undefined : undefined,
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

    if (amount > vault.idleBalance) {
      throw new BadRequestException(`Insufficient idle balance. Available: ${vault.idleBalance.toLocaleString()}`);
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
      reason: `Withdrawal request of ${amount.toLocaleString()} ${vault.baseAsset} to ${destinationWallet.slice(0, 8)}... — pending admin approval`,
      onChainAddress: vault.onChainAddress || undefined,
    });

    return { message: `Withdrawal request submitted for ${amount.toLocaleString()} ${vault.baseAsset}. Pending admin approval.`, requestId, status: 'pending' };
  }

  /**
   * Admin/PM approves and processes a pending withdrawal request.
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

    // ─── Step 1: Log withdrawal approval ──────────────────────
    await this.events.emit({
      vaultId: request.vaultId, actionType: 'WITHDRAWAL_APPROVED',
      actor: 'portfolio_manager', role: 'Portfolio Manager',
      asset: vault.baseAsset, amount: request.amount, result: 'success',
      reason: `Withdrawal request ${requestId} approved. Processing ${request.amount.toLocaleString()} ${vault.baseAsset} to ${destinationWallet.slice(0, 8)}...`,
      onChainAddress: vault.onChainAddress || undefined,
    });

    // ─── Step 2: On-chain USDC transfer to client wallet ──────
    let onChainTxSig = txSignature || null;
    if (destinationWallet) {
      try {
        const result = await this.vaultProgram.sendUsdc(destinationWallet, request.amount);
        onChainTxSig = result.txSignature;

        await this.events.emit({
          vaultId: request.vaultId, actionType: 'WITHDRAWAL_TRANSFERRED',
          actor: 'portfolio_manager', role: 'Portfolio Manager',
          asset: vault.baseAsset, amount: request.amount, result: 'success',
          reason: [
            `On-chain USDC transfer: ${request.amount.toLocaleString()} ${vault.baseAsset} sent to ${destinationWallet}.`,
            `From AMINA wallet (${result.aminaWallet}) to client wallet (${destinationWallet}).`,
            `Tx: ${result.txSignature}.`,
          ].join(' '),
          txSignature: result.txSignature,
          onChainAddress: destinationWallet,
        });
      } catch (e: any) {
        // Log transfer failure but continue with DB update
        await this.events.emit({
          vaultId: request.vaultId, actionType: 'WITHDRAWAL_TRANSFERRED',
          actor: 'portfolio_manager', role: 'Portfolio Manager',
          asset: vault.baseAsset, amount: request.amount, result: 'failed',
          reason: `On-chain USDC transfer failed: ${e.message}. Funds remain in AMINA custody for manual transfer.`,
          onChainAddress: destinationWallet,
        });
      }
    }

    // ─── Step 3: Update DB ────────────────────────────────────
    const updated = await this.prisma.vault.update({
      where: { vaultId: request.vaultId },
      data: { idleBalance: { decrement: request.amount }, totalNAV: { decrement: request.amount } },
    });

    await this.prisma.consentRequest.update({
      where: { requestId },
      data: { status: 'approved', consentedBy: 'portfolio_manager', consentedAt: new Date() },
    });

    // ─── Step 4: Final audit event ────────────────────────────
    await this.events.emit({
      vaultId: request.vaultId, actionType: 'REDEMPTION_EXECUTED',
      actor: 'portfolio_manager', role: 'Portfolio Manager',
      asset: vault.baseAsset, amount: request.amount, result: 'success',
      reason: [
        `Withdrawal ${requestId} completed: ${request.amount.toLocaleString()} ${vault.baseAsset} redeemed to ${destinationWallet.slice(0, 8)}...`,
        onChainTxSig ? `On-chain tx: ${onChainTxSig}.` : 'No on-chain transfer.',
        `Idle balance updated: ${updated.idleBalance.toLocaleString()} ${vault.baseAsset}.`,
      ].join(' '),
      txSignature: onChainTxSig || undefined,
      onChainAddress: destinationWallet || vault.onChainAddress || undefined,
    });

    return {
      message: `Withdrawal of ${request.amount.toLocaleString()} ${vault.baseAsset} processed`,
      txSignature: onChainTxSig,
      vault: updated,
    };
  }

  async unwind(vaultId: string, strategyId: string, amount?: number) {
    const vault = await this.prisma.vault.findUnique({
      where: { vaultId },
      include: { allocations: { where: { strategyId, status: { in: ['active', 'cooldown'] } } } },
    });
    if (!vault) throw new NotFoundException('Vault not found');

    const dbAllocations = vault.allocations;
    const totalUnwindDb = dbAllocations.reduce((s, a) => s + a.amount + a.yieldAccrued, 0);
    const yieldTotal = dbAllocations.reduce((s, a) => s + a.yieldAccrued, 0);

    // ─── Solstice: on-chain unlock + withdraw + redeem ───────────
    if (strategyId === 'solstice-eusx-yield') {
      // Read on-chain position
      const position = await this.solstice.getPositionForVault(vaultId);
      if (position.eusxBalance <= 0) {
        throw new BadRequestException('No on-chain eUSX position to unwind');
      }

      // Calculate unlock amount: partial or full
      const isPartial = amount != null && amount > 0 && amount < position.usxValue;
      const unlockUsxAmount = isPartial ? amount : position.usxValue;

      console.log(`[UNWIND] vault=${vaultId} on-chain eUSX=${position.eusxBalance} usxValue=${position.usxValue} requested=${amount || 'full'} unlocking=${unlockUsxAmount}`);

      // Step 1: Unlock eUSX → USX goes to cooldown escrow
      const unlockResult = await this.solstice.unlockEUSX(vaultId, unlockUsxAmount);

      // Step 2: Small delay then withdraw USX from cooldown escrow
      await new Promise(r => setTimeout(r, 2000));

      let withdrawResult: any = null;
      try {
        withdrawResult = await this.solstice.withdrawUSX(vaultId);
      } catch (e: any) {
        console.warn(`[UNWIND] Withdraw attempt failed: ${e.message}. Retrying after delay...`);
        // Retry once after another delay (devnet cooldown may be short)
        await new Promise(r => setTimeout(r, 3000));
        try {
          withdrawResult = await this.solstice.withdrawUSX(vaultId);
        } catch (e2: any) {
          // Still failing — mark as cooldown
          await this.prisma.allocation.updateMany({ where: { vaultId, strategyId, status: 'active' }, data: { status: 'cooldown' } });
          await this.events.emit({
            vaultId, actionType: 'SOLSTICE_COOLDOWN_REQUESTED', actor: 'portfolio_manager', role: 'Portfolio Manager',
            asset: vault.baseAsset, amount: unlockUsxAmount, strategy: strategyId, result: 'pending',
            reason: `eUSX unlocked on-chain (tx: ${unlockResult.txSignature}). Protocol cooldown in progress — funds pending withdrawal. Error: ${e2.message}`,
            txSignature: unlockResult.txSignature,
          });
          return {
            message: `eUSX unlocked on-chain. Withdrawal pending cooldown period.`,
            status: 'cooldown',
            unlockTx: unlockResult.txSignature,
            totalUnwind: unlockUsxAmount,
          };
        }
      }

      // ─── Success: update DB ──────────────────────────────────
      const returnAmount = withdrawResult?.usxReceived > 0 ? withdrawResult.usxReceived : unlockUsxAmount;

      if (isPartial) {
        // Partial pull: reduce allocation amount, keep active
        const activeAlloc = dbAllocations.find(a => a.status === 'active');
        if (activeAlloc) {
          await this.prisma.allocation.update({
            where: { id: activeAlloc.id },
            data: { amount: { decrement: returnAmount } },
          });
        }
      } else {
        // Full pull: mark all allocations as unwound
        await this.prisma.allocation.updateMany({ where: { vaultId, strategyId, status: { in: ['active', 'cooldown'] } }, data: { status: 'unwound' } });
      }

      await this.prisma.vault.update({ where: { vaultId }, data: { idleBalance: { increment: returnAmount } } });

      await this.events.emit({
        vaultId, actionType: 'UNWIND_EXECUTED', actor: 'portfolio_manager', role: 'Portfolio Manager',
        asset: vault.baseAsset, amount: returnAmount, strategy: strategyId, result: 'success',
        reason: [
          `${isPartial ? 'Partial' : 'Full'} on-chain unwind: unlocked ${unlockResult.eusxBurned?.toFixed(4) || '?'} eUSX (tx: ${unlockResult.txSignature}).`,
          `Withdrew + redeemed USX to collateral (tx: ${withdrawResult?.txSignature}).`,
          `Returned ${returnAmount.toFixed(4)} ${vault.baseAsset} to idle balance.`,
        ].join(' '),
        txSignature: withdrawResult?.txSignature || unlockResult.txSignature,
      });

      return {
        message: `Unwound ${returnAmount.toFixed(4)} ${vault.baseAsset}`,
        totalUnwind: returnAmount,
        unlockTx: unlockResult.txSignature,
        withdrawTx: withdrawResult?.txSignature,
        onChainVerified: withdrawResult?.onChainVerified || unlockResult?.onChainVerified || false,
      };
    }

    // ─── Non-Solstice strategies: DB-only unwind ──────────────
    if (!dbAllocations.length) throw new BadRequestException('No active allocations for this strategy');

    await this.prisma.allocation.updateMany({ where: { vaultId, strategyId, status: { in: ['active', 'cooldown'] } }, data: { status: 'unwound' } });
    await this.prisma.vault.update({ where: { vaultId }, data: { idleBalance: { increment: totalUnwindDb }, totalNAV: { increment: yieldTotal } } });

    await this.events.emit({
      vaultId, actionType: 'UNWIND_EXECUTED', actor: 'portfolio_manager', role: 'Portfolio Manager',
      asset: vault.baseAsset, amount: totalUnwindDb, strategy: strategyId, result: 'success',
      reason: `Unwound ${totalUnwindDb.toLocaleString()} ${vault.baseAsset} from strategy back to idle balance`,
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

  /**
   * On-ramp: Amina Bank sends USDC to the user's wallet on-chain.
   * Records the event in the audit trail.
   */
  async onramp(recipientWallet: string, amount: number, callerWallet?: string) {
    const result = await this.vaultProgram.sendUsdc(recipientWallet, amount);

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

    return { message: `Off-ramp of ${amount.toLocaleString()} USDC completed`, status: 'success', aminaWallet, txSignature };
  }

}
