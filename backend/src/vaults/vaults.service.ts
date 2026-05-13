import { Injectable, Inject, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PublicKey } from '@solana/web3.js';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { randomUUID, createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { SasService } from '../sas/sas.service';
import { VaultProgramService } from '../vault-program/vault-program.service';
import { SolsticeService } from '../solstice/solstice.service';
import { TranslationLayerService } from '../translation-layer/translation-layer.service';
import { TransferChecksService } from '../transfer-checks/transfer-checks.service';
import { WalletControllersService } from '../wallet-controllers/wallet-controllers.service';

@Injectable()
export class VaultsService {
  private prisma: PrismaService;
  private events: EventsService;
  private sas: SasService;
  private vaultProgram: VaultProgramService;
  private solstice: SolsticeService;
  private translationLayer: TranslationLayerService;
  private readonly PROTOCOL_BUFFER_BPS = 1000;
  private readonly useTranslationLayer = process.env.USE_TRANSLATION_LAYER !== 'false';

  private getDeployableBalance(idleBalance: number, totalNAV: number, bufferBps: number): number {
    return Math.max(0, idleBalance - (totalNAV * bufferBps) / 10000);
  }

  private async getBankBalanceValue(): Promise<number> {
    const config = await this.prisma.systemConfig.upsert({
      where: { id: 'singleton' },
      update: {},
      create: { id: 'singleton', bankBalance: 50000 },
    });
    return config.bankBalance;
  }

  private async adjustBankBalance(delta: number): Promise<number> {
    const config = await this.prisma.systemConfig.upsert({
      where: { id: 'singleton' },
      update: { bankBalance: { increment: delta } },
      create: { id: 'singleton', bankBalance: 50000 + delta },
    });
    return config.bankBalance;
  }

  private transferChecks: TransferChecksService;
  private walletControllers: WalletControllersService;

  constructor(
    @Inject(PrismaService) prisma: PrismaService,
    @Inject(EventsService) events: EventsService,
    @Inject(SasService) sas: SasService,
    @Inject(VaultProgramService) vaultProgram: VaultProgramService,
    @Inject(SolsticeService) solstice: SolsticeService,
    @Inject(TranslationLayerService) translationLayer: TranslationLayerService,
    @Inject(TransferChecksService) transferChecks: TransferChecksService,
    @Inject(WalletControllersService) walletControllers: WalletControllersService,
  ) {
    this.prisma = prisma;
    this.events = events;
    this.sas = sas;
    this.vaultProgram = vaultProgram;
    this.solstice = solstice;
    this.translationLayer = translationLayer;
    this.transferChecks = transferChecks;
    this.walletControllers = walletControllers;
  }

  /**
   * Verify that a wallet is the owner of a vault.
   * Throws ForbiddenException if the wallet doesn't match.
   * Also checks that the vault's linked credential is still active.
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
    // Verify the vault's credential is still active (not revoked)
    const credential = await this.prisma.credential.findUnique({
      where: { credentialId: vault.credentialId },
    });
    if (credential && (credential.revoked || credential.status !== 'active')) {
      throw new ForbiddenException(
        'Your credential has been revoked. Vault operations are suspended. Contact AMINA administration to request new access.'
      );
    }
  }

  /**
   * Get all vaults accessible by a specific wallet.
   * Filters out vaults whose linked credential has been revoked.
   */
  async findByWallet(walletAddress: string) {
    const vaults = await this.prisma.vault.findMany({
      where: { ownerWallet: walletAddress },
      include: { mandate: true, credential: true },
      orderBy: { createdAt: 'desc' },
    });
    // Only return vaults whose credential is still active
    const activeVaults = vaults.filter(
      (v) => v.credential && !v.credential.revoked && v.credential.status === 'active',
    );
    const aminaBankWallet = this.vaultProgram.getAminaBankWallet();
    return activeVaults.map(v => ({ ...v, aminaBankWallet }));
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

    const byOwner: Record<string, typeof vaults> = {};
    for (const v of vaults) {
      const key = v.ownerWallet || 'unknown';
      if (!byOwner[key]) byOwner[key] = [];
      byOwner[key].push(v);
    }

    let bankWalletOnChainBalance = 0;
    try {
      const bankVerification = await this.vaultProgram.verifyVaultOnChain('__bank__', undefined);
      bankWalletOnChainBalance = bankVerification.bankWalletBalance;
    } catch { /* ignore */ }

    const vaultsByOwner = await Promise.all(
      Object.entries(byOwner).map(async ([wallet, walletVaults]) => ({
        ownerWallet: wallet,
        vaultCount: walletVaults.length,
        totalDeposited: walletVaults.reduce((s, v) => s + (v.totalDeposited || 0), 0),
        totalNAV: walletVaults.reduce((s, v) => s + (v.totalNAV || 0), 0),
        vaults: await Promise.all(walletVaults.map(async (v) => {
          let solsticePosition: { eusxBalance: number; usxValue: number; exchangeRate: number; vaultAllocatedAmount: number; onChainYield: number } | null = null;
          try {
            solsticePosition = await this.solstice.getPositionForVault(v.vaultId);
          } catch { /* no on-chain position */ }

          const withdrawals = v.consentRequests
            .filter((c) => c.actionType === 'WITHDRAWAL')
            .map((c) => ({
              amount: c.amount,
              status: c.status,
              destinationWallet: (c.details as any)?.destinationWallet || (c.details as any)?.callerWallet || '',
              requestId: c.requestId,
              approvedAt: c.consentedAt,
              txSignature: (c.details as any)?.txSignature || null,
              createdAt: c.createdAt,
            }));
          const totalWithdrawn = withdrawals.filter(w => w.status === 'approved').reduce((s, w) => s + w.amount, 0);
          const totalPendingWithdrawal = withdrawals.filter(w => w.status === 'pending').reduce((s, w) => s + w.amount, 0);

          const allocationsWithOnChain = v.allocations.map((a) => {
            const isSolstice = a.strategyId === 'solstice-eusx-yield';
            const hasOnChainPosition = isSolstice && solsticePosition && solsticePosition.vaultAllocatedAmount > 0;
            return {
              strategyName: a.strategy?.name || a.strategyId,
              strategyId: a.strategyId,
              amount: a.amount,
              yieldAccrued: a.yieldAccrued,
              onChainYield: hasOnChainPosition ? solsticePosition!.onChainYield : 0,
              status: a.status,
              txSignature: a.txSignature,
              onChainAddress: a.onChainAddress,
              createdAt: a.createdAt,
              onChainVerified: !!a.txSignature || hasOnChainPosition,
            };
          });

          const onChainDeposits = v.deposits.map((d) => ({
            amount: d.amount,
            sourceWallet: d.sourceWallet,
            sourceReference: d.sourceReference,
            sourceType: d.sourceType,
            screeningStatus: d.screeningStatus,
            jurisdictionTag: d.jurisdictionTag,
            createdAt: d.createdAt,
            onChainVerified: !!d.sourceReference || d.sourceType === 'On-Chain Transfer',
          }));

          const onChainEvents = v.events.slice(0, 20).map((e) => ({
            eventId: e.eventId,
            actionType: e.actionType,
            amount: e.amount,
            result: e.result,
            txSignature: e.txSignature,
            onChainAddress: e.onChainAddress,
            compliancePda: e.compliancePda,
            travelRulePda: e.travelRulePda,
            routingPda: e.routingPda,
            glEntryPda: e.glEntryPda,
            translationLayerRef: e.translationLayerRef,
            timestamp: e.timestamp,
            onChainVerified: !!e.txSignature || !!e.onChainAddress,
          }));

          let onChainVerification: any = null;
          try {
            onChainVerification = await this.vaultProgram.verifyVaultOnChain(v.vaultId, v.programId || undefined);
          } catch { /* ignore */ }

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
            onChainVerification,
            credential: {
              credentialId: v.credential.credentialId,
              clientReference: v.credential.clientReference,
              jurisdiction: v.credential.jurisdiction,
              riskTier: v.credential.riskTier,
              attestationPda: v.credential.attestationPda,
            },
            deposits: onChainDeposits,
            allocations: allocationsWithOnChain,
            withdrawals,
            solsticePosition: solsticePosition ? {
              eusxBalance: solsticePosition.eusxBalance,
              usxValue: solsticePosition.usxValue,
              exchangeRate: solsticePosition.exchangeRate,
              vaultAllocatedAmount: solsticePosition.vaultAllocatedAmount,
              onChainYield: solsticePosition.onChainYield,
            } : null,
            recentEvents: onChainEvents,
          };
        })),
      }))
    );

    return {
      aminaWallet,
      bankWalletOnChainBalance,
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
    const vaultId = `VLT-${randomUUID().slice(0, 8).toUpperCase()}`;

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
          this.vaultProgram.getAminaBankWallet(),
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
          status: credentialResult ? 'success' : 'failed',
          detail: credentialResult ? `Credential PDA: ${credentialResult.credentialPda}` : 'Credential registration failed',
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

    // ─── Step 6: Verify Contract On-Chain (optional) ─────────────
    if (!hasFailed() && deployedProgramId && process.env.VERIFY_CONTRACTS === 'true') {
      try {
        const verifyResult = await this.vaultProgram.verifyProgramInstance(deployedProgramId);
        steps.push({
          step: 'Verify Contract',
          status: verifyResult.verified ? 'success' : 'failed',
          detail: verifyResult.verified
            ? `Binary verified: ${verifyResult.patchedOffsets.length} patched offsets match template`
            : `Verification failed: ${verifyResult.error}`,
          address: deployedProgramId,
        });
      } catch (e: any) {
        steps.push({ step: 'Verify Contract', status: 'failed', detail: e.message });
      }
    } else if (!hasFailed() && deployedProgramId && process.env.VERIFY_CONTRACTS !== 'true') {
      steps.push({ step: 'Verify Contract', status: 'skipped', detail: 'VERIFY_CONTRACTS not enabled' });
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

    // Auto-register wallet controllers for the new vault
    const vaultName = `${credential.clientReference} — ${vaultId}`;
    try {
      await this.walletControllers.autoRegister({
        address: credential.walletAddress,
        controllerName: `${credential.clientReference} — Client Wallet`,
        controllerType: 'CLIENT_ACCOUNT',
        permittedUse: 'Vault ownership, deposit initiation, mandate acceptance',
        source: 'vault-creation',
      });

      if (deployedProgramId) {
        await this.walletControllers.autoRegister({
          address: deployedProgramId,
          controllerName: `${vaultId} — Program Instance`,
          controllerType: 'SEGREGATED_VAULT',
          permittedUse: 'Segregated program — enforces mandate rules on-chain',
          vaultId,
          vaultName,
          bankNumber: 'AMINA-CH-001',
          accountNumber: `VLT-${vaultId}`,
          source: 'vault-creation',
        });
      }

      if (programResult?.vaultPda) {
        await this.walletControllers.autoRegister({
          address: programResult.vaultPda,
          controllerName: `${vaultId} — Vault PDA`,
          controllerType: 'SEGREGATED_VAULT',
          permittedUse: 'On-chain vault state, asset custody',
          vaultId,
          vaultName,
          bankNumber: 'AMINA-CH-001',
          accountNumber: `VLT-${vaultId}`,
          source: 'vault-creation',
        });
      }

      const bankWallet = this.vaultProgram.getAminaBankWallet();
      if (bankWallet) {
        await this.walletControllers.autoRegister({
          address: bankWallet,
          controllerName: 'Amina Bank — Treasury',
          controllerType: 'BANK_TREASURY',
          permittedUse: 'Vault program deployment, on-chain administration',
          bankNumber: 'AMINA-CH-001',
          accountNumber: 'TREASURY-001',
          source: 'vault-creation',
        });
      }
    } catch (e: any) {
      console.warn(`Failed to auto-register wallet controllers: ${e.message}`);
    }

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

    try {
      const position = await this.solstice.getPositionForVault(vaultId);
      if (position && position.vaultAllocatedAmount > 0) {
        strategyExposures['Solstice eUSX Yield'] = {
          amount: position.vaultAllocatedAmount,
          yield: position.onChainYield + activeAllocations.filter((a) => a.strategyId === 'solstice-eusx-yield').reduce((s, a) => s + a.yieldAccrued, 0),
          strategyId: 'solstice-eusx-yield',
        };
      }
    } catch { /* on-chain read failed, fall through to DB */ }

    activeAllocations.forEach((a) => {
      const key = a.strategy.name;
      if (!strategyExposures[key]) {
        strategyExposures[key] = { amount: 0, yield: 0, strategyId: a.strategyId };
      }
      if (a.strategyId !== 'solstice-eusx-yield') {
        strategyExposures[key].amount += a.amount;
        strategyExposures[key].yield += a.yieldAccrued;
      }
    });

    const totalDeployed = Object.values(strategyExposures).reduce((s, e) => s + e.amount, 0);

    // Liquidity buffer metrics
    const bufferBps = vault.mandate?.liquidityBufferBps ?? this.PROTOCOL_BUFFER_BPS;
    const totalNAV = vault.idleBalance + totalDeployed + totalYield;
    const requiredBuffer = (totalNAV * bufferBps) / 10000;
    const deployableBalance = this.getDeployableBalance(vault.idleBalance, totalNAV, bufferBps);
    const bufferUtilization = requiredBuffer > 0 ? (vault.idleBalance / requiredBuffer) * 100 : 100;
    const bufferHealth = vault.idleBalance >= requiredBuffer ? 'healthy' : 'violation';

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
      totalNAV,
      // Liquidity buffer metrics
      requiredBuffer,
      deployableBalance,
      bufferUtilization,
      bufferHealth,
      bufferBps,
      mandateStatus: vault.mandate?.status || 'none',
      mandateVersion: vault.mandate?.version ?? 1,
      onChainSynced: vault.mandate?.onChainSynced ?? false,
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

    // If the vault has a deployed program, attach the mandate on-chain immediately
    let txSignature: string | undefined;
    if (vault.programId) {
      try {
        const result = await this.vaultProgram.attachMandate(vault.programId, vaultId, mandate);
        txSignature = result?.txSignature;
        if (txSignature) {
          await this.prisma.mandate.update({
            where: { vaultId },
            data: { onChainSynced: true, onChainSyncTx: txSignature },
          });
        }
      } catch (e: any) {
        await this.events.emit({
          vaultId, actionType: 'MANDATE_ATTACH_FAILED', actor: 'admin', role: 'Admin',
          result: 'failure', reason: `On-chain mandate attach failed for vault ${vaultId}: ${e.message}. Mandate saved in DB.`,
        });
      }
    }

    await this.events.emit({
      vaultId, actionType: 'MANDATE_ATTACHED', actor: 'admin', role: 'Admin',
      result: 'success',
      reason: `Mandate bound to vault ${vaultId}.${txSignature ? ` Signed & anchored on-chain: tx ${txSignature}` : ''}`,
      txSignature,
    });
    return mandate;
  }

  async getMandate(vaultId: string) {
    const mandate = await this.prisma.mandate.findUnique({ where: { vaultId } });
    if (!mandate) throw new NotFoundException('No mandate found');
    return mandate;
  }

  async updateMandate(vaultId: string, data: {
    allowedStrategies?: string[]; blockedStrategies?: string[];
    maxAllocationBps?: Record<string, number>; liquidityBufferBps?: number;
    consentThreshold?: number; leverageAllowed?: boolean; approvedDestinations?: string[];
  }, updatedBy: string) {
    const vault = await this.prisma.vault.findUnique({ where: { vaultId }, include: { mandate: true } });
    if (!vault) throw new NotFoundException('Vault not found');
    if (!vault.mandate) throw new BadRequestException('No mandate attached to vault. Use POST to create one first.');

    if (data.liquidityBufferBps !== undefined && data.liquidityBufferBps < this.PROTOCOL_BUFFER_BPS) {
      throw new BadRequestException(
        `liquidityBufferBps (${data.liquidityBufferBps}) cannot be below the protocol minimum of ${this.PROTOCOL_BUFFER_BPS} (10%).`
      );
    }

    const oldMandate = { ...vault.mandate };

    // Archive all current active rules (history trail)
    await this.prisma.mandateRule.updateMany({
      where: { vaultId, status: 'active' },
      data: { status: 'superseded' },
    });

    // Create new typed rule rows
    const newRules = this.buildRulesFromData(vaultId, data, updatedBy);
    if (newRules.length > 0) {
      await this.prisma.mandateRule.createMany({ data: newRules });
    }

    // Update the mandate envelope
    const updated = await this.prisma.mandate.update({
      where: { vaultId },
      data: {
        ...(data.allowedStrategies !== undefined && { allowedStrategies: data.allowedStrategies }),
        ...(data.blockedStrategies !== undefined && { blockedStrategies: data.blockedStrategies }),
        ...(data.maxAllocationBps !== undefined && { maxAllocationBps: data.maxAllocationBps }),
        ...(data.liquidityBufferBps !== undefined && { liquidityBufferBps: data.liquidityBufferBps }),
        ...(data.consentThreshold !== undefined && { consentThreshold: data.consentThreshold }),
        ...(data.leverageAllowed !== undefined && { leverageAllowed: data.leverageAllowed }),
        ...(data.approvedDestinations !== undefined && { approvedDestinations: data.approvedDestinations }),
        version: { increment: 1 },
        lastUpdatedBy: updatedBy,
        onChainSynced: false,
      },
    });

    const changes = this.diffMandate(oldMandate, updated);
    await this.events.emit({
      vaultId, actionType: 'MANDATE_UPDATED', actor: updatedBy, role: 'Admin',
      result: 'success',
      reason: `Mandate v${updated.version} saved for vault ${vaultId}. Changes: ${changes}. On-chain sync pending.`,
    });

    return updated;
  }

  async getMandateRules(vaultId: string) {
    const vault = await this.prisma.vault.findUnique({ where: { vaultId } });
    if (!vault) throw new NotFoundException('Vault not found');
    return this.prisma.mandateRule.findMany({
      where: { vaultId, status: 'active' },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getMandateHistory(vaultId: string) {
    const vault = await this.prisma.vault.findUnique({ where: { vaultId } });
    if (!vault) throw new NotFoundException('Vault not found');
    return this.prisma.mandateRule.findMany({
      where: { vaultId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getBufferHealth(vaultId: string) {
    const vault = await this.prisma.vault.findUnique({
      where: { vaultId },
      include: { mandate: true, allocations: { where: { status: 'active' } } },
    });
    if (!vault) throw new NotFoundException('Vault not found');

    const activeDeployed = vault.allocations.reduce((s, a) => s + a.amount, 0);
    const totalNAV = vault.idleBalance + activeDeployed;
    const bufferBps = vault.mandate?.liquidityBufferBps ?? this.PROTOCOL_BUFFER_BPS;
    const requiredBuffer = (totalNAV * bufferBps) / 10000;
    const deployableBalance = this.getDeployableBalance(vault.idleBalance, totalNAV, bufferBps);
    const bufferUtilization = requiredBuffer > 0 ? (vault.idleBalance / requiredBuffer) * 100 : 100;
    const shortfall = Math.max(0, requiredBuffer - vault.idleBalance);
    const status = vault.idleBalance >= requiredBuffer ? 'healthy' : 'violation';

    return {
      vaultId,
      totalNAV,
      idleBalance: vault.idleBalance,
      requiredBuffer,
      deployableBalance,
      bufferUtilization,
      shortfall,
      bufferBps,
      status,
      message: status === 'healthy'
        ? `Buffer healthy. Idle: ${vault.idleBalance.toFixed(2)}, required: ${requiredBuffer.toFixed(2)}, deployable: ${deployableBalance.toFixed(2)}.`
        : `Buffer violation. Idle: ${vault.idleBalance.toFixed(2)}, required: ${requiredBuffer.toFixed(2)}, shortfall: ${shortfall.toFixed(2)}.`,
    };
  }

  async syncMandateToChain(vaultId: string, callerWallet?: string) {
    const vault = await this.prisma.vault.findUnique({ where: { vaultId }, include: { mandate: true } });
    if (!vault) throw new NotFoundException('Vault not found');
    if (!vault.mandate) throw new BadRequestException('No mandate to sync');

    // Attempt on-chain update via vault program
    let txSig: string | undefined;
    try {
      const result = await this.vaultProgram.updateMandate(vault.programId, vaultId, vault.mandate);
      txSig = result?.txSignature;
    } catch (e: any) {
      await this.events.emit({
        vaultId, actionType: 'MANDATE_SYNC_FAILED', actor: callerWallet || 'admin', role: 'Admin',
        result: 'failure', reason: `On-chain mandate sync failed for vault ${vaultId}: ${e.message}`,
      });
      throw new BadRequestException(`On-chain sync failed: ${e.message}`);
    }

    await this.prisma.mandate.update({
      where: { vaultId },
      data: { onChainSynced: true, onChainSyncTx: txSig },
    });

    // Mark all active rules as synced
    await this.prisma.mandateRule.updateMany({
      where: { vaultId, status: 'active' },
      data: { onChainSync: true, onChainTx: txSig },
    });

    await this.events.emit({
      vaultId, actionType: 'MANDATE_SYNCED', actor: callerWallet || 'admin', role: 'Admin',
      result: 'success',
      reason: `Mandate v${vault.mandate.version} signed and synced to chain for vault ${vaultId}. Signed by admin authority.`,
      txSignature: txSig,
      onChainAddress: vault.programId || undefined,
    });

    return { vaultId, onChainSynced: true, txSignature: txSig, programId: vault.programId };
  }

  private buildRulesFromData(vaultId: string, data: any, createdBy: string) {
    const rules: any[] = [];
    if (data.liquidityBufferBps !== undefined)
      rules.push({ vaultId, ruleType: 'liquidity_buffer', params: { bps: data.liquidityBufferBps }, status: 'active', version: 1, createdBy });
    if (data.consentThreshold !== undefined)
      rules.push({ vaultId, ruleType: 'consent_threshold', params: { amount: data.consentThreshold }, status: 'active', version: 1, createdBy });
    if (data.allowedStrategies !== undefined)
      rules.push({ vaultId, ruleType: 'strategy_allowlist', params: { strategies: data.allowedStrategies }, status: 'active', version: 1, createdBy });
    if (data.maxAllocationBps !== undefined)
      Object.entries(data.maxAllocationBps).forEach(([strategyId, bps]) =>
        rules.push({ vaultId, ruleType: 'strategy_cap', params: { strategyId, maxBps: bps }, status: 'active', version: 1, createdBy })
      );
    if (data.leverageAllowed !== undefined)
      rules.push({ vaultId, ruleType: data.leverageAllowed ? 'leverage_allowed' : 'leverage_banned', params: {}, status: 'active', version: 1, createdBy });
    if (data.approvedDestinations !== undefined)
      rules.push({ vaultId, ruleType: 'approved_destination', params: { wallets: data.approvedDestinations }, status: 'active', version: 1, createdBy });
    return rules;
  }

  private diffMandate(old: any, next: any): string {
    const changes: string[] = [];
    if (old.liquidityBufferBps !== next.liquidityBufferBps)
      changes.push(`buffer: ${old.liquidityBufferBps / 100}% → ${next.liquidityBufferBps / 100}%`);
    if (old.consentThreshold !== next.consentThreshold)
      changes.push(`consent threshold: ${old.consentThreshold} → ${next.consentThreshold}`);
    if (old.leverageAllowed !== next.leverageAllowed)
      changes.push(`leverage: ${old.leverageAllowed} → ${next.leverageAllowed}`);
    return changes.join(', ') || 'no scalar changes (array fields may have changed)';
  }

  private verifyMandateSignature(vaultId: string, signature: string, signerWallet: string): boolean {
    const expectedMessage = `I accept the investment mandate for vault ${vaultId}`;
    const messageBytes = new TextEncoder().encode(expectedMessage);
    const signatureBytes = bs58.decode(signature);
    const publicKeyBytes = new PublicKey(signerWallet).toBytes();
    return nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
  }

  async activateVault(vaultId: string, callerWallet?: string, signature?: string, signerWallet?: string) {
    await this.verifyVaultOwnership(vaultId, callerWallet, true);
    const vault = await this.prisma.vault.findUnique({ where: { vaultId } });
    if (!vault) throw new NotFoundException('Vault not found');
    if (vault.status === 'active') return vault;
    if (vault.status !== 'initiated') throw new BadRequestException(`Vault cannot be activated from status: ${vault.status}`);

    // Client-side activation requires wallet signature as cryptographic consent proof
    if (callerWallet) {
      if (!signature || !signerWallet) {
        throw new BadRequestException('Wallet signature required to approve mandate. Sign the acceptance message in your wallet.');
      }
      if (signerWallet !== callerWallet) {
        throw new ForbiddenException('Signer wallet does not match the connected wallet.');
      }
      if (vault.ownerWallet && signerWallet !== vault.ownerWallet) {
        throw new ForbiddenException('Signer wallet does not match vault owner wallet.');
      }
      try {
        const valid = this.verifyMandateSignature(vaultId, signature, signerWallet);
        if (!valid) {
          throw new BadRequestException('Invalid signature. The signed message does not match the expected mandate acceptance.');
        }
      } catch (e: any) {
        if (e instanceof BadRequestException || e instanceof ForbiddenException) throw e;
        throw new BadRequestException(`Signature verification failed: ${e.message}`);
      }
    }

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

      // Attach mandate on-chain — client has agreed to terms at activation
      const freshVault = await this.prisma.vault.findUnique({ where: { vaultId } });
      let attachResult: { txSignature: string } | null = null;
      try {
        attachResult = await this.vaultProgram.attachMandate(freshVault?.programId, vaultId, mandate);
      } catch (e: any) {
        await this.events.emit({
          vaultId, actionType: 'MANDATE_ATTACH_FAILED', actor: callerWallet || 'client', role: 'client_representative',
          result: 'failure',
          reason: `On-chain mandate attach failed at vault activation for ${vaultId}: ${e.message}. Mandate saved in DB but not yet on-chain.`,
        });
      }

      if (attachResult) {
        await this.prisma.mandate.update({
          where: { vaultId },
          data: { onChainSynced: true, onChainSyncTx: attachResult.txSignature },
        });
      }

      await this.events.emit({
        vaultId, actionType: 'MANDATE_ATTACHED', actor: callerWallet || 'client', role: 'client_representative',
        result: 'success',
        reason: `Default mandate created and accepted by client on vault activation. Allowed: ${allowedIds.join(', ')}.${attachResult ? ` Signed & anchored on-chain: tx ${attachResult.txSignature}` : ' On-chain sync pending — will require manual sync.'}`,
        txSignature: attachResult?.txSignature,
      });
    }

    const mandateAfterSync = await this.prisma.mandate.findUnique({ where: { vaultId } });

    const updated = await this.prisma.vault.update({
      where: { vaultId },
      data: { status: 'active' },
      include: { mandate: true },
    });

    await this.events.emit({
      vaultId,
      actionType: 'VAULT_ACTIVATED',
      actor: callerWallet || 'client',
      role: 'client_representative',
      result: 'success',
      reason: `Client approved mandate and activated vault ${vaultId}.${signature ? ` Wallet signature verified (signer: ${signerWallet?.slice(0, 8)}...).` : ' No wallet signature (admin activation).'} Mandate on-chain: ${mandateAfterSync?.onChainSynced ? 'yes' : 'pending'}.`,
      txSignature: mandateAfterSync?.onChainSyncTx || undefined,
    });

    return {
      ...updated,
      mandateOnChainSynced: mandateAfterSync?.onChainSynced ?? false,
      mandateOnChainTx: mandateAfterSync?.onChainSyncTx ?? null,
    };
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

    const [deposit, updated] = await this.prisma.$transaction(async (tx) => {
      const dep = await tx.deposit.create({
        data: {
          vaultId, amount,
          sourceWallet: sourceWallet || callerWallet || 'unknown',
          sourceReference: sourceReference || `SRC-${Date.now()}`,
          sourceType: sourceType || 'Approved Custody-Linked Wallet',
          jurisdictionTag: jurisdictionTag || 'CH',
        },
      });

      const upd = await tx.vault.update({
        where: { vaultId },
        data: { idleBalance: { increment: amount }, totalDeposited: { increment: amount }, totalNAV: { increment: amount } },
      });

      return [dep, upd] as const;
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

    // Auto-generate transfer check (Issue B-3)
    try {
      await this.transferChecks.createTransferCheck({
        transferId: deposit.id,
        transferType: 'DEPOSIT',
        vaultId,
        fromAddress: sourceWallet || callerWallet || 'unknown',
        toAddress: vault.ownerWallet || vaultId,
        asset: vault.baseAsset,
        amount,
        isExternal: true,
        isProviderTransfer: false,
        travelRuleThreshold: 1000,
      });
    } catch { /* non-blocking */ }

    // Route through translation layer for on-chain proof trail
    let translationLayerResult: any = null;
    if (this.useTranslationLayer) {
      try {
        const jurisdiction = deposit.jurisdictionTag || 'CH';
        const submitted = await this.translationLayer.submitInstruction('Deposit', vaultId, amount, jurisdiction, 'deposit');
        const compliance = await this.translationLayer.executeCompliance(submitted.instructionId, jurisdiction);
        const action = await this.translationLayer.executeAction(submitted.instructionId);
        translationLayerResult = { instructionId: submitted.instructionId, ...compliance, ...action };
      } catch (err: any) {
        // Non-blocking: log but don't fail the deposit
      }
    }

    return { deposit, vault: updated, translationLayerResult };
  }

  async allocate(vaultId: string, strategyId: string, amount: number) {
    await this.events.emit({ vaultId, actionType: 'ALLOCATION_INITIATED', actor: 'portfolio_manager', role: 'Portfolio Manager', asset: 'USDC', amount, strategy: strategyId, result: 'pending', reason: `Allocation initiated: ${amount} USDC to ${strategyId}` });
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

    // ─── Provider Approval Check (Issue A-4) ──────────────────────
    if (strategy.providerId) {
      const provider = await this.prisma.providerProfile.findUnique({ where: { id: strategy.providerId } });
      if (provider && provider.status !== 'APPROVED') {
        const reason = `Provider "${provider.providerName}" is ${provider.status}. Allocation blocked.`;
        await this.events.emit({ vaultId, actionType: 'ALLOCATION_BLOCKED', actor: 'portfolio_manager', role: 'Portfolio Manager', asset: vault.baseAsset, amount, strategy: strategyId, result: 'failure', reason });
        throw new ForbiddenException(reason);
      }
      if (provider) {
        // Check mandate fit (vault risk tier must match provider's mandateFit)
        const credential = await this.prisma.credential.findUnique({ where: { credentialId: vault.credentialId } });
        if (credential && provider.mandateFit.length > 0 && !provider.mandateFit.includes(credential.riskTier)) {
          const reason = `Vault risk tier "${credential.riskTier}" is not in provider's approved mandate fit: [${provider.mandateFit.join(', ')}]`;
          await this.events.emit({ vaultId, actionType: 'ALLOCATION_BLOCKED', actor: 'portfolio_manager', role: 'Portfolio Manager', asset: vault.baseAsset, amount, strategy: strategyId, result: 'failure', reason });
          throw new ForbiddenException(reason);
        }
        // Check exposure limit
        const existingProviderAlloc = vault.allocations.filter(a => a.strategyId === strategyId && a.status === 'active').reduce((s, a) => s + a.amount, 0);
        const maxExposure = (vault.totalNAV * provider.exposureLimit) / 100;
        if (existingProviderAlloc + amount > maxExposure) {
          const reason = `Allocation exceeds provider exposure limit of ${provider.exposureLimit}%. Max: ${maxExposure.toLocaleString()}, Current: ${existingProviderAlloc.toLocaleString()}, Requested: ${amount.toLocaleString()}`;
          await this.events.emit({ vaultId, actionType: 'ALLOCATION_BLOCKED', actor: 'portfolio_manager', role: 'Portfolio Manager', asset: vault.baseAsset, amount, strategy: strategyId, result: 'failure', reason });
          throw new ForbiddenException(reason);
        }
      }
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

    // Liquidity buffer check: use deployable balance as the allocation ceiling
    const requiredBuffer = (vault.totalNAV * mandate.liquidityBufferBps) / 10000;
    const deployableBalance = this.getDeployableBalance(vault.idleBalance, vault.totalNAV, mandate.liquidityBufferBps);
    if (amount > deployableBalance) {
      const reason = [
        `Allocation exceeds deployable balance.`,
        `Idle: ${vault.idleBalance.toLocaleString()}, Buffer locked: ${requiredBuffer.toFixed(2)},`,
        `Deployable: ${deployableBalance.toFixed(2)}, Requested: ${amount.toLocaleString()}.`,
        `Protocol requires ${mandate.liquidityBufferBps / 100}% of NAV (${requiredBuffer.toFixed(2)} ${vault.baseAsset}) to remain idle at all times.`,
      ].join(' ');
      await this.events.emit({ vaultId, actionType: 'ALLOCATION_BLOCKED', actor: 'portfolio_manager', role: 'Portfolio Manager', asset: vault.baseAsset, amount, strategy: strategyId, result: 'failure', reason });
      throw new ForbiddenException(reason);
    }

    // Consent threshold check
    if (amount >= mandate.consentThreshold) {
      const existing = await this.prisma.consentRequest.findFirst({
        where: { vaultId, actionType: 'ALLOCATION', amount, status: 'approved' },
      });

      if (!existing) {
        const requestId = `CONS-${randomUUID().slice(0, 8).toUpperCase()}`;

        await this.prisma.consentRequest.create({
          data: { requestId, vaultId, actionType: 'ALLOCATION', amount, details: { strategyId, strategyName: strategy.name }, initiator: 'portfolio_manager', status: 'pending' },
        });

        await this.events.emit({ vaultId, actionType: 'CONSENT_REQUESTED', actor: 'portfolio_manager', role: 'Portfolio Manager', asset: vault.baseAsset, amount, strategy: strategyId, result: 'pending', reason: `Amount ${amount.toLocaleString()} exceeds consent threshold ${mandate.consentThreshold.toLocaleString()}. Client approval required.` });

        return { status: 'consent_required', requestId, reason: `Amount ${amount.toLocaleString()} ${vault.baseAsset} exceeds consent threshold of ${mandate.consentThreshold.toLocaleString()} ${vault.baseAsset}. Client approval required.` };
      }
    }

    // Execute atomically
    const allocation = await this.prisma.$transaction(async (tx) => {
      const alloc = await tx.allocation.create({ data: { vaultId, strategyId, amount, status: 'active' } });
      await tx.vault.update({ where: { vaultId }, data: { idleBalance: { decrement: amount } } });
      return alloc;
    });

    await this.events.emit({ vaultId, actionType: 'ALLOCATION_EXECUTED', actor: 'portfolio_manager', role: 'Portfolio Manager', asset: vault.baseAsset, amount, strategy: strategyId, result: 'success', reason: `Allocated ${amount.toLocaleString()} ${vault.baseAsset} to ${strategy.name}` });

    // Auto-generate transfer check for allocation (Issue B-3)
    try {
      await this.transferChecks.createTransferCheck({
        transferId: allocation.id,
        transferType: 'ALLOCATION',
        vaultId,
        fromAddress: vault.ownerWallet || vaultId,
        toAddress: '0xSOLSTICE-PROVIDER-WALLET-0000000000000',
        asset: vault.baseAsset,
        amount,
        isExternal: true,
        isProviderTransfer: true,
        travelRuleThreshold: 1000,
      });
    } catch { /* non-blocking */ }

    // Route through AMINA translation layer for on-chain proof trail
    let translationLayerResult: any = null;
    if (this.useTranslationLayer) {
      try {
        const cred = await this.prisma.credential.findUnique({ where: { credentialId: vault.credentialId } });
        const jurisdiction = cred?.jurisdiction || 'CH';
        const submitted = await this.translationLayer.submitInstruction('Allocate', vaultId, amount, jurisdiction, strategyId);
        const compliance = await this.translationLayer.executeCompliance(submitted.instructionId, jurisdiction);
        const action = await this.translationLayer.executeAction(submitted.instructionId);
        translationLayerResult = { instructionId: submitted.instructionId, ...compliance, ...action };
        await this.events.emit({ vaultId, actionType: 'TL_PIPELINE_COMPLETE', actor: 'system', role: 'Translation Layer', asset: vault.baseAsset, amount, strategy: strategyId, result: 'success', reason: `Translation layer pipeline complete: ${submitted.instructionId}` });
      } catch (err: any) {
        await this.events.emit({ vaultId, actionType: 'TL_PIPELINE_COMPLETE', actor: 'system', role: 'Translation Layer', asset: vault.baseAsset, amount, strategy: strategyId, result: 'failure', reason: `Translation layer error (non-blocking): ${err.message}` });
      }
    }

    return { allocation, translationLayerResult, message: `Successfully allocated ${amount.toLocaleString()} ${vault.baseAsset} to ${strategy.name}` };
  }

  /**
   * Client requests a withdrawal. Creates a pending consent request.
   * The admin/PM must approve and process it via processWithdrawal().
   */
  async redeem(vaultId: string, amount: number, destinationWallet: string, callerWallet?: string, txSignature?: string) {
    await this.events.emit({ vaultId, actionType: 'WITHDRAWAL_INITIATED', actor: callerWallet || 'client', role: 'Client Representative', asset: 'USDC', amount, result: 'pending', reason: `Withdrawal initiated: ${amount} USDC to ${destinationWallet}` });
    await this.verifyVaultOwnership(vaultId, callerWallet, true);
    const vault = await this.prisma.vault.findUnique({ where: { vaultId }, include: { mandate: true } });
    if (!vault) throw new NotFoundException('Vault not found');

    if (amount > vault.totalNAV) {
      throw new BadRequestException(`Amount exceeds vault NAV. Total NAV: ${vault.totalNAV.toLocaleString()}`);
    }

    // Create a pending withdrawal request
    const requestId = `WDR-${randomUUID().slice(0, 8).toUpperCase()}`;

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

    // Buffer invariant: post-withdrawal idle must meet buffer on post-withdrawal NAV
    const mandate = await this.prisma.mandate.findUnique({ where: { vaultId: request.vaultId } });
    if (mandate) {
      const postIdle = vault.idleBalance - request.amount;
      const postNAV  = vault.totalNAV  - request.amount;
      const postRequired = (postNAV * mandate.liquidityBufferBps) / 10000;
      if (postIdle < postRequired) {
        const reason = [
          `Withdrawal would violate the liquidity buffer.`,
          `Post-withdrawal idle: ${postIdle.toFixed(2)}, required: ${postRequired.toFixed(2)} (${mandate.liquidityBufferBps / 100}% of post-NAV ${postNAV.toFixed(2)}).`,
          `Unwind deployed strategies first to free up idle balance.`,
        ].join(' ');
        await this.events.emit({
          vaultId: request.vaultId, actionType: 'WITHDRAWAL_BLOCKED', actor: 'admin', role: 'Admin',
          asset: vault.baseAsset, amount: request.amount, result: 'failure', reason,
        });
        throw new BadRequestException(reason);
      }
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

    // Update DB atomically
    const updated = await this.prisma.$transaction(async (tx) => {
      const v = await tx.vault.update({
        where: { vaultId: request.vaultId },
        data: { idleBalance: { decrement: request.amount }, totalNAV: { decrement: request.amount } },
      });

      await tx.consentRequest.update({
        where: { requestId },
        data: { status: 'approved', consentedBy: 'admin', consentedAt: new Date() },
      });

      return v;
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
      const position = await this.solstice.getPositionForVault(vaultId);
      if (!position || position.eusxBalance <= 0) {
        throw new BadRequestException('No on-chain eUSX position to unwind');
      }

      const onChainAmount = position.vaultAllocatedAmount;

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

  /** Get AMINA Bank USD balance (persisted) */
  async getBankBalance() {
    const balance = await this.getBankBalanceValue();
    return { balance, currency: 'USD' };
  }

  /**
   * On-ramp: Amina Bank sends USDC to the user's wallet on-chain.
   * Records the event in the audit trail.
   */
  async onramp(recipientWallet: string, amount: number, callerWallet?: string) {
    await this.events.emit({ vaultId: undefined, actionType: 'ONRAMP_INITIATED', actor: callerWallet || 'admin', role: 'Client Representative', asset: 'USD', amount, result: 'pending', reason: `Fiat on-ramp initiated: ${amount} USD → USDC` });
    const currentBalance = await this.getBankBalanceValue();
    if (amount > currentBalance) {
      throw new BadRequestException('Insufficient AMINA Bank balance');
    }
    const result = await this.vaultProgram.sendUsdc(recipientWallet, amount);
    await this.adjustBankBalance(-amount);

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
    await this.events.emit({ vaultId: undefined, actionType: 'OFFRAMP_INITIATED', actor: callerWallet || 'admin', role: 'Client Representative', asset: 'USDC', amount, result: 'pending', reason: `Fiat off-ramp initiated: ${amount} USDC → USD` });
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

    await this.adjustBankBalance(amount);
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
      onChainDeployed = position?.vaultAllocatedAmount || 0;
    } catch { /* no on-chain position */ }

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

  /**
   * Generate Proof of Reserves using Merkle tree.
   * Each vault becomes a leaf: SHA256(vaultId:totalBalance)
   * Returns Merkle root, total reserves, and per-vault proof paths.
   */
  async getProofOfReserves() {
    const vaults = await this.prisma.vault.findMany({
      where: { status: 'active' },
      include: { allocations: { where: { status: 'active' } } },
      orderBy: { vaultId: 'asc' },
    });

    if (vaults.length === 0) {
      return {
        merkleRoot: null,
        totalReserves: 0,
        vaultCount: 0,
        timestamp: new Date().toISOString(),
        vaults: [],
      };
    }

    // Calculate total balance for each vault (idle + allocated)
    const vaultBalances = vaults.map((v) => {
      const allocatedBalance = v.allocations.reduce((s, a) => s + a.amount, 0);
      const totalBalance = v.idleBalance + allocatedBalance;
      return {
        vaultId: v.vaultId,
        idleBalance: v.idleBalance,
        allocatedBalance,
        totalBalance,
        baseAsset: v.baseAsset,
      };
    });

    // Build Merkle tree
    const leaves = vaultBalances.map((vb) => {
      const leafData = `${vb.vaultId}:${vb.totalBalance}`;
      return createHash('sha256').update(leafData).digest('hex');
    });

    // Build tree levels bottom-up
    const { root, proofs } = this.buildMerkleTree(leaves);

    // Aggregate totals
    const totalReserves = vaultBalances.reduce((s, vb) => s + vb.totalBalance, 0);

    // Emit audit event
    await this.events.emit({
      actionType: 'PROOF_OF_RESERVES_GENERATED',
      actor: 'system',
      role: 'Compliance',
      result: 'success',
      reason: `Proof of Reserves generated: ${vaultBalances.length} vaults, total reserves: ${totalReserves.toLocaleString()} USDC, Merkle root: ${root}`,
    });

    return {
      merkleRoot: root,
      totalReserves,
      vaultCount: vaultBalances.length,
      timestamp: new Date().toISOString(),
      vaults: vaultBalances.map((vb, index) => ({
        vaultId: vb.vaultId,
        totalBalance: vb.totalBalance,
        idleBalance: vb.idleBalance,
        allocatedBalance: vb.allocatedBalance,
        baseAsset: vb.baseAsset,
        leafHash: leaves[index],
        proof: proofs[index],
      })),
    };
  }

  /**
   * Build Merkle tree from leaves and generate proof paths for each leaf.
   * Returns the root hash and an array of proofs (one per leaf).
   */
  private buildMerkleTree(leaves: string[]): {
    root: string;
    proofs: Array<{ hash: string; position: 'left' | 'right' }[]>;
  } {
    if (leaves.length === 0) {
      return { root: '', proofs: [] };
    }

    // Store proof paths for each original leaf index
    const proofs: Array<{ hash: string; position: 'left' | 'right' }[]> = leaves.map(() => []);

    let currentLevel = [...leaves];
    let leafIndexMapping = leaves.map((_, i) => i); // Track original leaf indices

    // Build tree bottom-up
    while (currentLevel.length > 1) {
      const nextLevel: string[] = [];
      const nextIndexMapping: number[] = [];

      // Process pairs
      for (let i = 0; i < currentLevel.length; i += 2) {
        const left = currentLevel[i];
        const right = i + 1 < currentLevel.length ? currentLevel[i + 1] : currentLevel[i]; // Duplicate last if odd

        const leftIndices = leafIndexMapping.slice(
          i * Math.pow(2, Math.log2(leaves.length / currentLevel.length)),
          (i + 1) * Math.pow(2, Math.log2(leaves.length / currentLevel.length))
        );
        const rightIndices = i + 1 < currentLevel.length
          ? leafIndexMapping.slice(
              (i + 1) * Math.pow(2, Math.log2(leaves.length / currentLevel.length)),
              (i + 2) * Math.pow(2, Math.log2(leaves.length / currentLevel.length))
            )
          : leftIndices;

        // Compute parent hash
        const parent = createHash('sha256').update(left + right).digest('hex');
        nextLevel.push(parent);

        // Add sibling to proof paths for all leaves under left child
        const leftLeaves = this.getLeafIndicesInRange(i, currentLevel.length, leaves.length);
        leftLeaves.forEach((leafIdx) => {
          proofs[leafIdx].push({ hash: right, position: 'right' });
        });

        // Add sibling to proof paths for all leaves under right child (if different from left)
        if (i + 1 < currentLevel.length && right !== left) {
          const rightLeaves = this.getLeafIndicesInRange(i + 1, currentLevel.length, leaves.length);
          rightLeaves.forEach((leafIdx) => {
            proofs[leafIdx].push({ hash: left, position: 'left' });
          });
        }

        nextIndexMapping.push(...leftIndices, ...rightIndices);
      }

      currentLevel = nextLevel;
      leafIndexMapping = nextIndexMapping;
    }

    return { root: currentLevel[0], proofs };
  }

  /**
   * Helper to determine which original leaf indices are under a given node position.
   */
  private getLeafIndicesInRange(nodeIndex: number, levelSize: number, totalLeaves: number): number[] {
    const leavesPerNode = Math.ceil(totalLeaves / levelSize);
    const startIdx = nodeIndex * leavesPerNode;
    const endIdx = Math.min(startIdx + leavesPerNode, totalLeaves);
    const indices: number[] = [];
    for (let i = startIdx; i < endIdx; i++) {
      indices.push(i);
    }
    return indices;
  }

  /**
   * Generate comprehensive regulatory report containing:
   * 1. Summary: total AUM, deposits, yield, vaults, reporting period
   * 2. Per-vault NAV statements: vaultId, owner, deposits, NAV, yield, unrealized gains
   * 3. Yield attribution by strategy: strategyId, name, allocated, yield, weighted APY
   * 4. Fund flow summary: inflows, outflows, net flow
   * 5. Compliance metrics: total events, events by type, failed events
   */
  async getRegulatoryReport(from?: string, to?: string) {
    // Default to last 30 days if no date range provided
    const toDate = to ? new Date(to) : new Date();
    const fromDate = from ? new Date(from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Fetch all vaults with related data
    const vaults = await this.prisma.vault.findMany({
      include: {
        allocations: {
          include: { strategy: true },
          where: { status: 'active' },
        },
        deposits: {
          where: {
            createdAt: { gte: fromDate, lte: toDate },
          },
        },
        consentRequests: {
          where: {
            actionType: 'WITHDRAWAL',
            status: 'approved',
            consentedAt: { gte: fromDate, lte: toDate },
          },
        },
      },
    });

    // Fetch compliance events within the period
    const complianceEvents = await this.prisma.complianceEvent.findMany({
      where: {
        timestamp: { gte: fromDate, lte: toDate },
      },
    });

    // 1. Summary metrics
    const totalAUM = vaults.reduce((sum, v) => sum + v.totalNAV, 0);
    const totalDeposits = vaults.reduce((sum, v) => sum + v.totalDeposited, 0);
    const totalYieldEarned = vaults.reduce((sum, v) => {
      const vaultYield = v.allocations.reduce((s, a) => s + a.yieldAccrued, 0);
      return sum + vaultYield;
    }, 0);
    const activeVaultCount = vaults.filter(v => v.status === 'active').length;

    // 2. Per-vault NAV statements
    const vaultStatements = vaults.map(vault => {
      const yieldEarned = vault.allocations.reduce((s, a) => s + a.yieldAccrued, 0);
      const unrealizedGains = vault.totalNAV - vault.totalDeposited;

      return {
        vaultId: vault.vaultId,
        ownerWallet: vault.ownerWallet,
        totalDeposited: vault.totalDeposited,
        currentNAV: vault.totalNAV,
        yieldEarned,
        unrealizedGains,
        baseAsset: vault.baseAsset,
        status: vault.status,
      };
    });

    // 3. Yield attribution by strategy
    const strategyMap = new Map<string, {
      strategyId: string;
      strategyName: string;
      totalAllocated: number;
      totalYieldGenerated: number;
      allocationCount: number;
      currentYield: number;
    }>();

    vaults.forEach(vault => {
      vault.allocations.forEach(allocation => {
        const existing = strategyMap.get(allocation.strategyId) || {
          strategyId: allocation.strategyId,
          strategyName: allocation.strategy.name,
          totalAllocated: 0,
          totalYieldGenerated: 0,
          allocationCount: 0,
          currentYield: allocation.strategy.currentYield,
        };

        existing.totalAllocated += allocation.amount;
        existing.totalYieldGenerated += allocation.yieldAccrued;
        existing.allocationCount += 1;

        strategyMap.set(allocation.strategyId, existing);
      });
    });

    const yieldAttribution = Array.from(strategyMap.values()).map(strat => {
      // Weighted APY calculation: if yield was generated, calculate effective APY
      // This is simplified - real calculation would need time-weighted average
      const effectiveAPY = strat.totalAllocated > 0
        ? (strat.totalYieldGenerated / strat.totalAllocated) * 100
        : 0;

      return {
        strategyId: strat.strategyId,
        strategyName: strat.strategyName,
        totalAllocated: strat.totalAllocated,
        totalYieldGenerated: strat.totalYieldGenerated,
        weightedAPY: effectiveAPY,
        allocationCount: strat.allocationCount,
        currentYield: strat.currentYield,
      };
    });

    // 4. Fund flow summary
    const totalInflows = vaults.reduce((sum, v) => {
      return sum + v.deposits.reduce((s, d) => s + d.amount, 0);
    }, 0);

    const totalOutflows = vaults.reduce((sum, v) => {
      return sum + v.consentRequests.reduce((s, c) => s + c.amount, 0);
    }, 0);

    const netFlow = totalInflows - totalOutflows;

    // 5. Compliance metrics
    const totalEvents = complianceEvents.length;
    const eventsByType = complianceEvents.reduce((acc, event) => {
      acc[event.actionType] = (acc[event.actionType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const failedEvents = complianceEvents.filter(e => e.result === 'failure').length;
    const successEvents = complianceEvents.filter(e => e.result === 'success').length;
    const pendingEvents = complianceEvents.filter(e => e.result === 'pending').length;

    const report = {
      summary: {
        totalAUM,
        totalDeposits,
        totalYieldEarned,
        activeVaultCount,
        totalVaultCount: vaults.length,
        reportingPeriod: {
          from: fromDate.toISOString(),
          to: toDate.toISOString(),
        },
        generatedAt: new Date().toISOString(),
      },
      vaultStatements,
      yieldAttribution,
      fundFlowSummary: {
        totalInflows,
        totalOutflows,
        netFlow,
        reportingPeriod: {
          from: fromDate.toISOString(),
          to: toDate.toISOString(),
        },
      },
      complianceMetrics: {
        totalEvents,
        eventsByType,
        eventsByResult: {
          success: successEvents,
          failure: failedEvents,
          pending: pendingEvents,
        },
        failureRate: totalEvents > 0 ? (failedEvents / totalEvents) * 100 : 0,
      },
    };

    // Emit audit event for report generation
    await this.events.emit({
      actionType: 'REGULATORY_REPORT_GENERATED',
      actor: 'compliance_officer',
      role: 'Compliance Officer',
      result: 'success',
      reason: [
        `Regulatory report generated for period ${fromDate.toISOString().split('T')[0]} to ${toDate.toISOString().split('T')[0]}.`,
        `Total AUM: ${totalAUM.toLocaleString()}. Active vaults: ${activeVaultCount}. Total yield: ${totalYieldEarned.toLocaleString()}.`,
        `Fund flows - Inflows: ${totalInflows.toLocaleString()}, Outflows: ${totalOutflows.toLocaleString()}, Net: ${netFlow.toLocaleString()}.`,
        `Compliance events: ${totalEvents} total, ${failedEvents} failures, ${successEvents} successes.`,
      ].join(' '),
    });

    return report;
  }

}
