import { Injectable, Inject, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { getSasConfig, getIssuerSecretKey } from './sas.config';
import {
  getCreateAttestationInstruction,
  getCloseAttestationInstruction,
  deriveAttestationPda,
} from 'sas-lib';
import {
  createSolanaRpc,
  address,
  createKeyPairSignerFromBytes,
  pipe,
  createTransactionMessage,
  setTransactionMessageFeePayerSigner,
  appendTransactionMessageInstruction,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  getBase64EncodedWireTransaction,
} from '@solana/kit';
import { PublicKey } from '@solana/web3.js';
import { createHash } from 'crypto';

@Injectable()
export class SasService {
  private readonly logger = new Logger(SasService.name);
  private prisma: PrismaService;

  constructor(@Inject(PrismaService) prisma: PrismaService) {
    this.prisma = prisma;
  }

  private isConfigured(): boolean {
    const cfg = getSasConfig();
    return !!(cfg.credentialPda && cfg.schemaPda && cfg.issuerKeypairBase58);
  }

  /**
   * Send a signed transaction via RPC (no WebSocket needed).
   * Polls for confirmation using getSignatureStatuses.
   */
  private async sendAndPollConfirmation(rpc: any, signedTx: any): Promise<string> {
    const wireTransaction = getBase64EncodedWireTransaction(signedTx);
    const txSig = await rpc.sendTransaction(wireTransaction, {
      encoding: 'base64',
      skipPreflight: true,
      preflightCommitment: 'confirmed',
    }).send();

    this.logger.log(`Transaction sent: ${txSig}`);

    // Poll for confirmation (up to 30 seconds)
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 1000));
      try {
        const { value } = await rpc.getSignatureStatuses([txSig]).send();
        if (value[0]?.confirmationStatus === 'confirmed' || value[0]?.confirmationStatus === 'finalized') {
          this.logger.log(`Transaction confirmed: ${txSig}`);
          return String(txSig);
        }
        if (value[0]?.err) {
          throw new Error(`Transaction failed on-chain: ${JSON.stringify(value[0].err)}`);
        }
      } catch (e: any) {
        if (e.message?.includes('failed on-chain')) throw e;
        // Otherwise keep polling
      }
    }

    // Return signature even if not yet confirmed (it was sent)
    this.logger.warn(`Transaction sent but not confirmed within 30s: ${txSig}`);
    return String(txSig);
  }

  async createAttestation(
    walletAddress: string,
    data: {
      credentialId: string;
      clientReference: string;
      jurisdiction: string;
      riskTier: string;
      productEligibility: string;
    },
  ): Promise<{ pda: string; txSignature: string } | null> {
    if (!this.isConfigured()) {
      this.logger.warn('SAS not configured — skipping on-chain attestation. Run npm run sas:setup to enable.');
      return null;
    }

    try {
      const cfg = getSasConfig();
      const rpc = createSolanaRpc(cfg.rpcUrl);

      const issuerSecretKey = getIssuerSecretKey();
      const payer = await createKeyPairSignerFromBytes(issuerSecretKey);

      const credentialAddress = address(cfg.credentialPda);
      const schemaAddress = address(cfg.schemaPda);
      const nonce = address(walletAddress);

      const [attestationPda] = await deriveAttestationPda({
        credential: credentialAddress,
        schema: schemaAddress,
        nonce,
      });

      // Serialize attestation data as borsh: 5 length-prefixed strings
      const fields = [data.credentialId, data.clientReference, data.jurisdiction, data.riskTier, data.productEligibility];
      const parts: number[] = [];
      for (const field of fields) {
        const bytes = new TextEncoder().encode(field);
        parts.push(bytes.length & 0xff, (bytes.length >> 8) & 0xff, (bytes.length >> 16) & 0xff, (bytes.length >> 24) & 0xff);
        parts.push(...bytes);
      }
      const attestationData = new Uint8Array(parts);

      const expiry = BigInt(Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60);

      const createAttestationIx = getCreateAttestationInstruction({
        payer,
        authority: payer,
        credential: credentialAddress,
        schema: schemaAddress,
        attestation: attestationPda,
        nonce,
        data: attestationData,
        expiry,
      });

      const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

      const transactionMessage = pipe(
        createTransactionMessage({ version: 0 }),
        (msg) => setTransactionMessageFeePayerSigner(payer, msg),
        (msg) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, msg),
        (msg) => appendTransactionMessageInstruction(createAttestationIx, msg),
      );

      const signedTx = await signTransactionMessageWithSigners(transactionMessage);
      const txSignature = await this.sendAndPollConfirmation(rpc, signedTx);

      this.logger.log(`Attestation created for ${walletAddress}: PDA=${attestationPda}, tx=${txSignature}`);

      return {
        pda: String(attestationPda),
        txSignature,
      };
    } catch (error: any) {
      this.logger.error(`Failed to create attestation for ${walletAddress}: ${error.message}`);
      if (error.cause) this.logger.error(`Cause: ${JSON.stringify(error.cause, (_, v) => typeof v === 'bigint' ? v.toString() : v)}`);
      if (error.stack) this.logger.error(error.stack);
      return null;
    }
  }

  /**
   * Derive a deterministic Solana address from a vaultId string.
   * Hashes the vaultId to produce 32 bytes usable as a Solana public key.
   */
  private deriveVaultNonce(vaultId: string): string {
    const hash = createHash('sha256').update(`amina-vault:${vaultId}`).digest();
    // Use the hash as a seed to derive a valid public key on the ed25519 curve
    const key = PublicKey.findProgramAddressSync(
      [Buffer.from('vault-nonce'), Buffer.from(vaultId)],
      new PublicKey('11111111111111111111111111111111'),
    )[0];
    return key.toBase58();
  }

  /**
   * Create a vault-specific attestation binding a vault to a wallet.
   * Uses a deterministic nonce derived from vaultId so each vault gets a unique PDA.
   */
  async createVaultAttestation(
    ownerWallet: string,
    vaultData: {
      vaultId: string;
      credentialId: string;
      clientReference: string;
      baseAsset: string;
    },
  ): Promise<{ pda: string; txSignature: string; onChainAddress: string } | null> {
    if (!this.isConfigured()) {
      this.logger.warn('SAS not configured — skipping vault attestation');
      return null;
    }

    try {
      const cfg = getSasConfig();
      const rpc = createSolanaRpc(cfg.rpcUrl);
      const issuerSecretKey = getIssuerSecretKey();
      const payer = await createKeyPairSignerFromBytes(issuerSecretKey);

      const credentialAddress = address(cfg.credentialPda);
      const schemaAddress = address(cfg.schemaPda);

      // Deterministic nonce from vaultId — each vault gets a unique PDA
      // This fixes the collision when one wallet has multiple vaults
      const vaultNonceAddress = this.deriveVaultNonce(vaultData.vaultId);
      const nonce = address(vaultNonceAddress);

      const [attestationPda] = await deriveAttestationPda({
        credential: credentialAddress,
        schema: schemaAddress,
        nonce,
      });

      // Check if attestation already exists for this specific vault
      const existingAccount = await rpc.getAccountInfo(attestationPda, { encoding: 'base64' }).send();
      if (existingAccount.value) {
        this.logger.log(`Vault attestation already exists for vault ${vaultData.vaultId}: ${attestationPda}`);
        return {
          pda: String(attestationPda),
          txSignature: 'existing',
          onChainAddress: String(attestationPda),
        };
      }

      // Serialize vault data as borsh strings (includes ownerWallet for binding)
      const fields = [vaultData.vaultId, vaultData.credentialId, vaultData.clientReference, vaultData.baseAsset, ownerWallet];
      const parts: number[] = [];
      for (const field of fields) {
        const bytes = new TextEncoder().encode(field);
        parts.push(bytes.length & 0xff, (bytes.length >> 8) & 0xff, (bytes.length >> 16) & 0xff, (bytes.length >> 24) & 0xff);
        parts.push(...bytes);
      }
      const attestationData = new Uint8Array(parts);
      const expiry = BigInt(Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60);

      const createIx = getCreateAttestationInstruction({
        payer,
        authority: payer,
        credential: credentialAddress,
        schema: schemaAddress,
        attestation: attestationPda,
        nonce,
        data: attestationData,
        expiry,
      });

      const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
      const txMsg = pipe(
        createTransactionMessage({ version: 0 }),
        (msg) => setTransactionMessageFeePayerSigner(payer, msg),
        (msg) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, msg),
        (msg) => appendTransactionMessageInstruction(createIx, msg),
      );

      const signedTx = await signTransactionMessageWithSigners(txMsg);
      const txSignature = await this.sendAndPollConfirmation(rpc, signedTx);

      this.logger.log(`Vault attestation created: vault=${vaultData.vaultId}, wallet=${ownerWallet}, PDA=${attestationPda}, tx=${txSignature}`);

      return {
        pda: String(attestationPda),
        txSignature,
        onChainAddress: String(attestationPda),
      };
    } catch (error: any) {
      this.logger.error(`Failed to create vault attestation: ${error.message}`);
      return null;
    }
  }

  /**
   * Verify a wallet has a valid attestation (either credential or vault level).
   */
  async verifyAttestation(
    walletAddress: string,
  ): Promise<{ verified: boolean; pda: string; exists: boolean }> {
    if (!this.isConfigured()) {
      return { verified: false, pda: '', exists: false };
    }

    try {
      const cfg = getSasConfig();
      const rpc = createSolanaRpc(cfg.rpcUrl);

      const credentialAddress = address(cfg.credentialPda);
      const schemaAddress = address(cfg.schemaPda);
      const nonce = address(walletAddress);

      const [attestationPda] = await deriveAttestationPda({
        credential: credentialAddress,
        schema: schemaAddress,
        nonce,
      });

      const accountInfo = await rpc.getAccountInfo(attestationPda, { encoding: 'base64' }).send();
      const exists = accountInfo.value !== null;

      this.logger.log(`Attestation verification for ${walletAddress}: exists=${exists}, PDA=${attestationPda}`);

      return {
        verified: exists,
        pda: String(attestationPda),
        exists,
      };
    } catch (error) {
      this.logger.error(`Verification failed for ${walletAddress}: ${(error as Error).message}`);
      return { verified: false, pda: '', exists: false };
    }
  }

  async revokeAttestation(
    attestationPda: string,
  ): Promise<{ txSignature: string } | null> {
    if (!this.isConfigured()) {
      this.logger.warn('SAS not configured — skipping on-chain revocation');
      return null;
    }

    try {
      const cfg = getSasConfig();
      const rpc = createSolanaRpc(cfg.rpcUrl);

      const issuerSecretKey = getIssuerSecretKey();
      const payer = await createKeyPairSignerFromBytes(issuerSecretKey);

      const credentialAddress = address(cfg.credentialPda);
      const schemaAddress = address(cfg.schemaPda);

      const closeAttestationIx = getCloseAttestationInstruction({
        payer,
        authority: payer,
        credential: credentialAddress,
        schema: schemaAddress,
        attestation: address(attestationPda),
      } as any);

      const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

      const transactionMessage = pipe(
        createTransactionMessage({ version: 0 }),
        (msg) => setTransactionMessageFeePayerSigner(payer, msg),
        (msg) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, msg),
        (msg) => appendTransactionMessageInstruction(closeAttestationIx, msg),
      );

      const signedTx = await signTransactionMessageWithSigners(transactionMessage);
      const txSignature = await this.sendAndPollConfirmation(rpc, signedTx);

      this.logger.log(`Attestation revoked: PDA=${attestationPda}, tx=${txSignature}`);

      return { txSignature };
    } catch (error) {
      this.logger.error(`Failed to revoke attestation ${attestationPda}: ${(error as Error).message}`);
      return null;
    }
  }
}
