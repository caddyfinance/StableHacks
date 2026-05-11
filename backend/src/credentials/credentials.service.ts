import { Injectable, Inject, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { SasService } from '../sas/sas.service';
import { WalletControllersService } from '../wallet-controllers/wallet-controllers.service';

@Injectable()
export class CredentialsService {
  private prisma: PrismaService;
  private events: EventsService;
  private sas: SasService;
  private walletControllers: WalletControllersService;
  private readonly logger = new Logger(CredentialsService.name);

  constructor(
    @Inject(PrismaService) prisma: PrismaService,
    @Inject(EventsService) events: EventsService,
    @Inject(SasService) sas: SasService,
    @Inject(WalletControllersService) walletControllers: WalletControllersService,
  ) {
    this.prisma = prisma;
    this.events = events;
    this.sas = sas;
    this.walletControllers = walletControllers;
  }

  async findAll() {
    return this.prisma.credential.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async isCredentialValid(credentialId: string): Promise<{ valid: boolean; reason?: string; onChainVerified?: boolean }> {
    const credential = await this.prisma.credential.findUnique({ where: { credentialId } });
    if (!credential) return { valid: false, reason: 'Credential not found' };
    if (credential.revoked) return { valid: false, reason: 'Credential has been revoked' };
    if (credential.status !== 'active') return { valid: false, reason: `Credential status is ${credential.status}` };
    if (credential.expiryAt && credential.expiryAt < new Date()) return { valid: false, reason: 'Credential has expired' };

    // On-chain verification
    let onChainVerified = false;
    if (credential.walletAddress) {
      try {
        const sasResult = await this.sas.verifyAttestation(credential.walletAddress);
        onChainVerified = sasResult.verified;
      } catch { /* graceful degradation */ }
    }

    return { valid: true, onChainVerified };
  }

  async findByWallet(walletAddress: string) {
    const credential = await this.prisma.credential.findFirst({
      where: { walletAddress, status: 'active', revoked: false },
    });
    if (!credential) return { authenticated: false, reason: 'No active credential found for this wallet' };

    const vault = await this.prisma.vault.findFirst({
      where: { credentialId: credential.credentialId },
    });

    // On-chain verification
    let onChainVerified = false;
    try {
      const sasResult = await this.sas.verifyAttestation(walletAddress);
      onChainVerified = sasResult.verified;
    } catch { /* graceful degradation */ }

    return {
      authenticated: true,
      credential,
      vault: vault || null,
      onChainVerified,
    };
  }

  async verifyOnChain(walletAddress: string) {
    return this.sas.verifyAttestation(walletAddress);
  }

  async bindWallet(credentialId: string, walletAddress: string) {
    const credential = await this.prisma.credential.findUnique({ where: { credentialId } });
    if (!credential) return { success: false, reason: 'Credential not found' };
    if (credential.revoked) return { success: false, reason: 'Credential has been revoked' };
    if (credential.status !== 'active') return { success: false, reason: 'Credential is not active' };

    const updated = await this.prisma.credential.update({
      where: { credentialId },
      data: { walletAddress },
    });

    const vault = await this.prisma.vault.findFirst({ where: { credentialId } });

    // Create on-chain attestation for the bound wallet (graceful)
    let attestationPda: string | undefined;
    let attestationTxSig: string | undefined;
    const sasResult = await this.sas.createAttestation(walletAddress, {
      credentialId,
      clientReference: credential.clientReference,
      jurisdiction: credential.jurisdiction,
      riskTier: credential.riskTier,
      productEligibility: credential.productEligibility,
    });
    if (sasResult) {
      attestationPda = sasResult.pda;
      attestationTxSig = sasResult.txSignature;
      await this.prisma.credential.update({
        where: { credentialId },
        data: { attestationPda, attestationTxSig },
      });
    }

    await this.events.emit({
      actionType: 'WALLET_BOUND',
      actor: 'client',
      role: 'Client Representative',
      result: 'success',
      reason: `Wallet ${walletAddress.slice(0, 8)}... bound to credential ${credentialId}${attestationPda ? ' (on-chain attested)' : ''}`,
      txSignature: attestationTxSig,
      onChainAddress: attestationPda,
    });

    try {
      await this.walletControllers.autoRegister({
        address: walletAddress,
        controllerName: `${credential.clientReference} — Client Wallet`,
        controllerType: 'CLIENT_ACCOUNT',
        permittedUse: 'Vault ownership, deposit initiation, mandate acceptance',
        source: 'wallet-bind',
      });
    } catch (e: any) {
      this.logger.warn(`Failed to auto-register wallet on bind: ${e.message}`);
    }

    return {
      success: true,
      authenticated: true,
      credential: { ...updated, attestationPda, attestationTxSig },
      vault: vault || null,
      onChainAttested: !!attestationPda,
    };
  }

  async verifyByReference(clientReference: string) {
    const credential = await this.prisma.credential.findFirst({
      where: { clientReference, status: 'active', revoked: false },
    });
    if (!credential) return { found: false, reason: 'No active credential found for this client reference' };

    return {
      found: true,
      credentialId: credential.credentialId,
      clientReference: credential.clientReference,
      jurisdiction: credential.jurisdiction,
      riskTier: credential.riskTier,
      currentWallet: credential.walletAddress,
    };
  }

  async issue(data: {
    clientReference: string;
    jurisdiction: string;
    riskTier: string;
    productEligibility: string;
    walletAddress: string;
  }) {
    const count = await this.prisma.credential.count();
    const credentialId = `SAS-VAULT-${String(count + 1).padStart(3, '0')}`;

    const credential = await this.prisma.credential.create({
      data: { credentialId, ...data, status: 'active' },
    });

    // Create on-chain SAS attestation (graceful — null if SAS not configured)
    let attestationPda: string | undefined;
    let attestationTxSig: string | undefined;
    const sasResult = await this.sas.createAttestation(data.walletAddress, {
      credentialId,
      clientReference: data.clientReference,
      jurisdiction: data.jurisdiction,
      riskTier: data.riskTier,
      productEligibility: data.productEligibility,
    });
    if (sasResult) {
      attestationPda = sasResult.pda;
      attestationTxSig = sasResult.txSignature;
      await this.prisma.credential.update({
        where: { credentialId },
        data: { attestationPda, attestationTxSig },
      });
    }

    await this.events.emit({
      actionType: 'CREDENTIAL_ISSUED',
      actor: 'admin',
      role: 'Admin',
      result: 'success',
      reason: `Credential ${credentialId} issued for ${data.clientReference}${attestationPda ? ' — on-chain attestation created' : ''}`,
      txSignature: attestationTxSig,
      onChainAddress: attestationPda,
    });

    try {
      await this.walletControllers.autoRegister({
        address: data.walletAddress,
        controllerName: `${data.clientReference} — Client Wallet`,
        controllerType: 'CLIENT_ACCOUNT',
        permittedUse: 'Vault ownership, deposit initiation, mandate acceptance',
        source: 'credential-issue',
      });
    } catch (e: any) {
      this.logger.warn(`Failed to auto-register wallet on credential issue: ${e.message}`);
    }

    return { ...credential, attestationPda, attestationTxSig };
  }

  async revoke(credentialId: string) {
    const credential = await this.prisma.credential.findUnique({ where: { credentialId } });
    if (!credential) throw new Error(`Credential ${credentialId} not found`);
    if (credential.revoked) return credential;

    // Revoke on-chain attestation if it exists
    let onChainRevoked = false;
    let revokeTxSignature: string | undefined;
    if (credential.attestationPda) {
      const result = await this.sas.revokeAttestation(credential.attestationPda);
      if (result?.txSignature) {
        onChainRevoked = true;
        revokeTxSignature = result.txSignature;
      }
    }

    const updated = await this.prisma.credential.update({
      where: { credentialId },
      data: { status: 'revoked', revoked: true },
    });

    const reason = credential.attestationPda
      ? onChainRevoked
        ? `Credential ${credentialId} revoked — on-chain attestation closed (tx: ${revokeTxSignature})`
        : `Credential ${credentialId} revoked in database — on-chain revocation failed (attestation may still exist)`
      : `Credential ${credentialId} revoked (no on-chain attestation)`;

    await this.events.emit({
      actionType: 'CREDENTIAL_REVOKED',
      actor: 'admin',
      role: 'Admin',
      result: 'success',
      reason,
      onChainAddress: credential.attestationPda || undefined,
      txSignature: revokeTxSignature,
    });

    return {
      ...updated,
      onChainRevoked,
      revokeTxSignature,
    };
  }
}
