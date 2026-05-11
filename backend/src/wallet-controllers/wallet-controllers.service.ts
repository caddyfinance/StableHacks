import { Injectable, Inject, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WalletControllersService {
  private readonly logger = new Logger(WalletControllersService.name);

  constructor(@Inject(PrismaService) private prisma: PrismaService) {}

  async findAll() {
    const controllers = await this.prisma.walletController.findMany({ orderBy: { createdAt: 'desc' } });
    return this.enrichControllers(controllers);
  }

  async findByAddress(address: string) {
    const controller = await this.prisma.walletController.findUnique({ where: { address } });
    if (!controller) throw new NotFoundException('Wallet controller not found');
    const enriched = await this.enrichControllers([controller]);
    return enriched[0];
  }

  async create(data: any) {
    const vaultName = data.vaultName || null;
    const bankNumber = data.bankNumber || null;
    const accountNumber = data.accountNumber || null;

    return this.prisma.walletController.create({
      data: {
        address: data.address,
        controllerName: data.controllerName,
        controllerType: data.controllerType || 'UNKNOWN',
        permittedUse: data.permittedUse,
        verificationStatus: data.verificationStatus || 'VERIFIED',
        explorerLink: data.explorerLink || null,
        chainalysisLink: data.chainalysisLink || null,
        vaultId: data.vaultId || null,
        vaultName,
        providerId: data.providerId || null,
        bankNumber,
        accountNumber,
      },
    });
  }

  async autoRegister(data: {
    address: string;
    controllerName: string;
    controllerType: string;
    permittedUse: string;
    vaultId?: string;
    vaultName?: string;
    providerId?: string;
    bankNumber?: string;
    accountNumber?: string;
    source: string;
  }) {
    if (!data.address) return null;
    const existing = await this.prisma.walletController.findUnique({ where: { address: data.address } });
    if (existing) {
      const updateData: Record<string, any> = {};
      if (data.vaultId && !existing.vaultId) updateData.vaultId = data.vaultId;
      if (data.vaultName && !existing.vaultName) updateData.vaultName = data.vaultName;
      if (data.providerId && !existing.providerId) updateData.providerId = data.providerId;
      if (data.bankNumber && !existing.bankNumber) updateData.bankNumber = data.bankNumber;
      if (data.accountNumber && !existing.accountNumber) updateData.accountNumber = data.accountNumber;
      if (data.controllerName && (existing.controllerName === existing.address.slice(0, 8) || existing.controllerName === existing.address)) {
        updateData.controllerName = data.controllerName;
      }
      if (existing.verificationStatus === 'PENDING' && data.controllerType === 'BANK_TREASURY') {
        updateData.verificationStatus = 'VERIFIED';
      }
      if (Object.keys(updateData).length > 0) {
        return this.prisma.walletController.update({ where: { address: data.address }, data: updateData });
      }
      return existing;
    }
    const created = await this.prisma.walletController.create({
      data: {
        address: data.address,
        controllerName: data.controllerName,
        controllerType: data.controllerType,
        permittedUse: data.permittedUse,
        verificationStatus: data.controllerType === 'BANK_TREASURY' ? 'VERIFIED' : 'PENDING',
        explorerLink: `https://explorer.solana.com/address/${data.address}?cluster=devnet`,
        vaultId: data.vaultId || null,
        vaultName: data.vaultName || null,
        providerId: data.providerId || null,
        bankNumber: data.bankNumber || null,
        accountNumber: data.accountNumber || null,
      },
    });
    this.logger.log(`Auto-registered wallet controller: ${data.address.slice(0, 8)}... as ${data.controllerType} (source: ${data.source})`);
    return created;
  }

  async syncFromExistingData() {
    let created = 0;
    let updated = 0;

    const credentials = await this.prisma.credential.findMany({ where: { revoked: false } });
    for (const cred of credentials) {
      if (!cred.walletAddress) continue;
      const result = await this.autoRegister({
        address: cred.walletAddress,
        controllerName: `${cred.clientReference} — Client Wallet`,
        controllerType: 'CLIENT_ACCOUNT',
        permittedUse: 'Vault ownership, deposit initiation, mandate acceptance',
        source: 'credential-sync',
      });
      if ((result as any)?.createdAt === (result as any)?.updatedAt) created++; else if (result) updated++;
    }

    const vaults = await this.prisma.vault.findMany({ include: { credential: true } });
    for (const vault of vaults) {
      const vaultName = `${vault.clientReference} — ${vault.vaultId}`;

      if (vault.onChainAddress) {
        const result = await this.autoRegister({
          address: vault.onChainAddress,
          controllerName: `${vault.vaultId} — Vault PDA`,
          controllerType: 'SEGREGATED_VAULT',
          permittedUse: 'On-chain vault state, asset custody',
          vaultId: vault.vaultId,
          vaultName,
          source: 'vault-sync',
        });
        if ((result as any)?.createdAt === (result as any)?.updatedAt) created++; else if (result) updated++;
      }

      if (vault.programId) {
        const result = await this.autoRegister({
          address: vault.programId,
          controllerName: `${vault.vaultId} — Program Instance`,
          controllerType: 'SEGREGATED_VAULT',
          permittedUse: 'Segregated program — enforces mandate rules on-chain',
          vaultId: vault.vaultId,
          vaultName,
          source: 'vault-sync',
        });
        if ((result as any)?.createdAt === (result as any)?.updatedAt) created++; else if (result) updated++;
      }
    }

    const providers = await this.prisma.providerProfile.findMany({ where: { status: 'APPROVED' } });
    for (const prov of providers) {
      const provAddress = prov.destinationWallet;
      if (!provAddress || provAddress === 'Approved') continue;
      const result = await this.autoRegister({
        address: provAddress,
        controllerName: `${prov.providerName} — Provider Wallet`,
        controllerType: 'PROVIDER_ADDRESS',
        permittedUse: 'Yield strategy execution, returns distribution',
        providerId: prov.id,
        source: 'provider-sync',
      });
      if ((result as any)?.createdAt === (result as any)?.updatedAt) created++; else if (result) updated++;
    }

    this.logger.log(`Sync complete: ${created} new, ${updated} existing, from ${credentials.length} credentials, ${vaults.length} vaults, ${providers.length} providers`);
    return { created, updated, scanned: { credentials: credentials.length, vaults: vaults.length, providers: providers.length } };
  }

  private async enrichControllers(controllers: any[]) {
    const vaultMap = new Map<string, any>();
    const credMap = new Map<string, any>();
    const recentEvents = new Map<string, number>();
    const vaultEventsByVault = new Map<string, number>();

    const allVaults = await this.prisma.vault.findMany({ include: { credential: true } });
    for (const v of allVaults) {
      const vaultInfo = {
        vaultId: v.vaultId,
        status: v.status,
        paused: v.paused,
        clientReference: v.clientReference,
        onChainAddress: v.onChainAddress,
        programId: v.programId,
        baseAsset: v.baseAsset,
        totalNAV: v.totalNAV,
        idleBalance: v.idleBalance,
        ownerWallet: v.ownerWallet,
        credentialId: v.credentialId,
        jurisdiction: v.credential?.jurisdiction || null,
      };
      if (v.ownerWallet) vaultMap.set(v.ownerWallet, vaultInfo);
      if (v.onChainAddress) vaultMap.set(v.onChainAddress, vaultInfo);
      if (v.programId) vaultMap.set(v.programId, vaultInfo);
    }

    const allCreds = await this.prisma.credential.findMany({ where: { revoked: false } });
    for (const c of allCreds) {
      if (c.walletAddress) credMap.set(c.walletAddress, c);
    }

    const events = await this.prisma.complianceEvent.findMany({
      orderBy: { timestamp: 'desc' },
      take: 500,
    });
    for (const e of events) {
      if (e.onChainAddress && !recentEvents.has(e.onChainAddress)) {
        recentEvents.set(e.onChainAddress, e.timestamp.getTime());
      }
      if (e.vaultId && !vaultEventsByVault.has(e.vaultId)) {
        vaultEventsByVault.set(e.vaultId, e.timestamp.getTime());
      }
    }

    return controllers.map((c) => {
      const vault = vaultMap.get(c.address);
      const cred = credMap.get(c.address);
      const lastActivity = recentEvents.get(c.address) || (c.vaultId ? vaultEventsByVault.get(c.vaultId) : null);
      let activityStatus = 'inactive';
      if (lastActivity) {
        const hoursAgo = (Date.now() - lastActivity) / (1000 * 60 * 60);
        activityStatus = hoursAgo < 24 ? 'active' : hoursAgo < 168 ? 'recent' : 'inactive';
      }

      const vaultStatus = vault?.status || null;
      const vaultPaused = vault?.paused || false;

      let resolvedVaultName = c.vaultName;
      if (!resolvedVaultName && vault) {
        resolvedVaultName = `${vault.clientReference} — ${vault.vaultId}`;
      }

      const resolvedVaultId = c.vaultId || vault?.vaultId || null;
      const resolvedOnChainAddress = vault?.onChainAddress || null;

      let resolvedBankNumber = c.bankNumber;
      let resolvedAccountNumber = c.accountNumber;
      if (!resolvedBankNumber && c.controllerType === 'BANK_TREASURY') {
        resolvedBankNumber = 'AMINA-CH-001';
      }
      if (!resolvedAccountNumber && c.controllerType === 'BANK_TREASURY') {
        resolvedAccountNumber = 'TREASURY-001';
      }
      if (!resolvedBankNumber && vault && c.controllerType === 'SEGREGATED_VAULT') {
        resolvedBankNumber = 'AMINA-CH-001';
      }
      if (!resolvedAccountNumber && vault && c.controllerType === 'SEGREGATED_VAULT') {
        resolvedAccountNumber = `VLT-${vault.vaultId}`;
      }
      if (!resolvedBankNumber && cred && c.controllerType === 'CLIENT_ACCOUNT') {
        resolvedBankNumber = 'AMINA-CH-001';
      }
      if (!resolvedAccountNumber && cred && c.controllerType === 'CLIENT_ACCOUNT') {
        resolvedAccountNumber = `CLI-${cred.credentialId}`;
      }

      let effectiveVerificationStatus = c.verificationStatus;
      if (c.verificationStatus === 'PENDING' && lastActivity) {
        const hoursAgo = (Date.now() - lastActivity) / (1000 * 60 * 60);
        if (hoursAgo < 72) {
          effectiveVerificationStatus = 'VERIFIED';
        }
      }

      return {
        ...c,
        vaultName: resolvedVaultName,
        vaultId: resolvedVaultId,
        onChainAddress: resolvedOnChainAddress,
        bankNumber: resolvedBankNumber,
        accountNumber: resolvedAccountNumber,
        verificationStatus: effectiveVerificationStatus,
        linkedVault: vault ? {
          vaultId: vault.vaultId,
          status: vault.status,
          paused: vault.paused,
          clientReference: vault.clientReference,
          onChainAddress: vault.onChainAddress,
          programId: vault.programId,
          baseAsset: vault.baseAsset,
          totalNAV: vault.totalNAV,
          jurisdiction: vault.jurisdiction,
        } : null,
        linkedCredential: cred ? {
          credentialId: cred.credentialId,
          clientReference: cred.clientReference,
          jurisdiction: cred.jurisdiction,
          riskTier: cred.riskTier,
        } : null,
        activityStatus,
        vaultStatus,
        vaultPaused,
        lastActivityAt: lastActivity ? new Date(lastActivity).toISOString() : null,
      };
    });
  }

  async resolveController(address: string): Promise<string> {
    const controller = await this.prisma.walletController.findUnique({ where: { address } });
    return controller?.controllerName || 'Unknown';
  }

  async resolveControllerType(address: string): Promise<string> {
    const controller = await this.prisma.walletController.findUnique({ where: { address } });
    return controller?.controllerType || 'UNKNOWN';
  }
}
