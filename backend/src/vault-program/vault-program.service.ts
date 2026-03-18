import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import {
  BpfLoader,
  BPF_LOADER_PROGRAM_ID,
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import bs58 from 'bs58';

/** Template program ID compiled into the .so binary via declare_id!() */
const TEMPLATE_PROGRAM_ID = '5uPg5pi46gXErKcYWyqEAn2uSU68VZSUgvGTPZuVGwyA';

/**
 * Service to interact with the AMINA Vault Anchor program on-chain.
 * Supports per-user segregated program deployment: each vault gets its own
 * deployed program instance with a unique program ID for true non-commingling.
 */
@Injectable()
export class VaultProgramService {
  private readonly logger = new Logger(VaultProgramService.name);

  private getProgramPublicKey(programId?: string): PublicKey {
    const id = programId || process.env.AMINA_PROGRAM_ID;
    if (!id) throw new Error('AMINA_PROGRAM_ID not set in .env');
    return new PublicKey(id);
  }

  private getAminaBankKeypair(): Keypair {
    const key = process.env.AMINA_BANK_KEYPAIR || process.env.SAS_ISSUER_KEYPAIR;
    if (!key) throw new Error('AMINA_BANK_KEYPAIR (or SAS_ISSUER_KEYPAIR) not set in .env');
    return Keypair.fromSecretKey(bs58.decode(key));
  }

  private getConnection(): Connection {
    const rpc = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
    return new Connection(rpc, { commitment: 'confirmed', wsEndpoint: undefined as any });
  }

  private isConfigured(): boolean {
    return !!process.env.AMINA_PROGRAM_ID;
  }

  /**
   * Compute the Anchor instruction discriminator.
   * Anchor uses sha256("global:<instruction_name>")[0..8]
   */
  private getDiscriminator(instructionName: string): Buffer {
    const hash = createHash('sha256')
      .update(`global:${instructionName}`)
      .digest();
    return hash.subarray(0, 8);
  }

  /**
   * Borsh-serialize a string: 4-byte LE length prefix + UTF-8 bytes
   */
  private serializeString(value: string): Buffer {
    const bytes = Buffer.from(value, 'utf8');
    const len = Buffer.alloc(4);
    len.writeUInt32LE(bytes.length, 0);
    return Buffer.concat([len, bytes]);
  }

  /**
   * Poll for transaction confirmation using getSignatureStatuses (no WebSocket needed).
   */
  private async pollConfirmation(connection: Connection, txSignature: string, timeoutMs = 30000): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      await new Promise(r => setTimeout(r, 1500));
      try {
        const { value } = await connection.getSignatureStatuses([txSignature]);
        const status = value[0];
        if (status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized') {
          if (status.err) {
            throw new Error(`Transaction failed on-chain: ${JSON.stringify(status.err)}`);
          }
          this.logger.log(`Transaction confirmed: ${txSignature}`);
          return;
        }
      } catch (e: any) {
        if (e.message?.includes('failed on-chain')) throw e;
      }
    }
    this.logger.warn(`Transaction sent but not confirmed within ${timeoutMs}ms: ${txSignature}`);
  }

  /**
   * Send a transaction and poll for confirmation (no WebSocket).
   */
  private async sendAndConfirm(connection: Connection, transaction: Transaction): Promise<string> {
    const txSignature = await connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });
    this.logger.log(`Transaction sent: ${txSignature}`);
    await this.pollConfirmation(connection, txSignature);
    return txSignature;
  }

  // ─── Per-User Program Deployment ──────────────────────────────

  /**
   * Resolve the path to the template .so binary built by `anchor build`.
   */
  private getTemplateBinaryPath(): string {
    const soPath = process.env.AMINA_VAULT_SO_PATH
      || path.resolve(__dirname, '..', '..', '..', 'contracts', 'target', 'deploy', 'amina_vault.so');
    if (!fs.existsSync(soPath)) {
      throw new Error(`Template binary not found at ${soPath}. Run "anchor build" in contracts/.`);
    }
    return soPath;
  }

  /**
   * Patch the compiled ELF binary: find all occurrences of the template program ID
   * (32 bytes) and replace them with the new program keypair's public key.
   * This is necessary because Anchor's declare_id!() embeds the program ID in the
   * binary and checks it at runtime.
   */
  patchBinary(elfBuffer: Buffer, newProgramId: PublicKey): Buffer {
    const templateBytes = bs58.decode(TEMPLATE_PROGRAM_ID);
    const newBytes = newProgramId.toBytes();
    const patched = Buffer.from(elfBuffer);

    let replacements = 0;
    for (let i = 0; i <= patched.length - 32; i++) {
      let match = true;
      for (let j = 0; j < 32; j++) {
        if (patched[i + j] !== templateBytes[j]) {
          match = false;
          break;
        }
      }
      if (match) {
        newBytes.forEach((b, j) => { patched[i + j] = b; });
        replacements++;
        i += 31; // skip past this match
      }
    }

    this.logger.log(`Patched ${replacements} occurrence(s) of template program ID in binary`);
    if (replacements === 0) {
      throw new Error('No template program ID bytes found in binary — binary may be corrupted or already patched');
    }

    return patched;
  }

  /**
   * Deploy a new program instance for a specific client wallet.
   * 1. Generate a fresh keypair (new program ID)
   * 2. Read the template .so binary
   * 3. Patch the binary with the new program ID
   * 4. Deploy via BpfLoader.load()
   */
  async deployNewProgramInstance(clientWallet: string): Promise<{
    programId: string;
    programKeypair: Keypair;
    txSignature: string;
  }> {
    const connection = this.getConnection();
    const authority = this.getAminaBankKeypair();

    // Generate a fresh keypair for this program instance
    const programKeypair = Keypair.generate();
    const newProgramId = programKeypair.publicKey;

    this.logger.log(`Deploying new program instance for wallet ${clientWallet}: programId=${newProgramId.toBase58()}`);

    // Read and patch the template binary
    const soPath = this.getTemplateBinaryPath();
    const rawElf = fs.readFileSync(soPath);
    const patchedElf = this.patchBinary(rawElf, newProgramId);

    // Deploy via BpfLoader
    const success = await BpfLoader.load(
      connection,
      authority,
      programKeypair,
      patchedElf,
      BPF_LOADER_PROGRAM_ID,
    );

    if (!success) {
      throw new Error(`BpfLoader.load returned false for programId=${newProgramId.toBase58()}`);
    }

    this.logger.log(`Program instance deployed: ${newProgramId.toBase58()} for wallet ${clientWallet}`);

    return {
      programId: newProgramId.toBase58(),
      programKeypair,
      txSignature: newProgramId.toBase58(), // BpfLoader doesn't return a single tx sig
    };
  }

  /**
   * Call the `initialize` instruction on a freshly deployed program instance.
   * Sets the admin authority and records the vault owner wallet.
   */
  async initializeProgram(
    programId: string,
    vaultOwnerWallet: string,
  ): Promise<{ configPda: string; txSignature: string }> {
    const connection = this.getConnection();
    const authority = this.getAminaBankKeypair();
    const programPubkey = new PublicKey(programId);

    // Derive config PDA: seeds = [b"config"]
    const [configPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('config')],
      programPubkey,
    );

    this.logger.log(`Initializing program ${programId}, config PDA=${configPda.toBase58()}, vaultOwner=${vaultOwnerWallet}`);

    // Build instruction data: discriminator + borsh(vault_owner_wallet as Pubkey)
    const discriminator = this.getDiscriminator('initialize');
    const walletBytes = new PublicKey(vaultOwnerWallet).toBytes();
    const instructionData = Buffer.concat([discriminator, Buffer.from(walletBytes)]);

    const instruction = new TransactionInstruction({
      programId: programPubkey,
      keys: [
        { pubkey: configPda, isSigner: false, isWritable: true },              // config (init, PDA)
        { pubkey: authority.publicKey, isSigner: true, isWritable: true },      // authority (signer, payer)
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system_program
      ],
      data: instructionData,
    });

    const transaction = new Transaction().add(instruction);
    transaction.feePayer = authority.publicKey;
    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    transaction.recentBlockhash = blockhash;
    transaction.sign(authority);

    const txSignature = await this.sendAndConfirm(connection, transaction);

    this.logger.log(`Program initialized: ${programId}, tx=${txSignature}`);
    return { configPda: configPda.toBase58(), txSignature };
  }

  // ─── PDA Derivation ───────────────────────────────────────────

  /**
   * Derive the vault PDA: seeds = [b"vault", vault_id.as_bytes()]
   */
  deriveVaultPda(vaultId: string, programId?: string): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('vault'), Buffer.from(vaultId)],
      this.getProgramPublicKey(programId),
    );
  }

  /**
   * Derive the credential PDA: seeds = [b"credential", credential_id.as_bytes()]
   */
  deriveCredentialPda(credentialId: string, programId?: string): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('credential'), Buffer.from(credentialId)],
      this.getProgramPublicKey(programId),
    );
  }

  /**
   * Get the Amina Bank wallet public key (the authority that deploys all vaults).
   */
  getAminaBankWallet(): string {
    try {
      return this.getAminaBankKeypair().publicKey.toBase58();
    } catch {
      return '';
    }
  }

  /**
   * Get the template AMINA Vault program ID (shared template contract address).
   */
  getProgramId(): string {
    return process.env.AMINA_PROGRAM_ID || '';
  }

  /**
   * Send USDC from the Amina Bank wallet to a recipient wallet.
   * Used for on-ramp: Amina sends USDC to the client after fiat is received.
   */
  async sendUsdc(
    recipientWallet: string,
    amount: number,
  ): Promise<{ txSignature: string; aminaWallet: string }> {
    const connection = this.getConnection();
    const authority = this.getAminaBankKeypair();
    const recipient = new PublicKey(recipientWallet);
    const usdcMint = new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');
    const amountLamports = BigInt(Math.round(amount * 1e6));

    // Import SPL token functions dynamically
    const { getAssociatedTokenAddress, createAssociatedTokenAccountIdempotentInstruction, createTransferInstruction } = await import('@solana/spl-token');

    const senderAta = await getAssociatedTokenAddress(usdcMint, authority.publicKey);
    const recipientAta = await getAssociatedTokenAddress(usdcMint, recipient);

    this.logger.log(`Sending ${amount} USDC from Amina (${authority.publicKey.toBase58()}) to ${recipientWallet}`);

    const tx = new Transaction();
    tx.add(createAssociatedTokenAccountIdempotentInstruction(authority.publicKey, recipientAta, recipient, usdcMint));
    tx.add(createTransferInstruction(senderAta, recipientAta, authority.publicKey, amountLamports));

    tx.feePayer = authority.publicKey;
    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    tx.recentBlockhash = blockhash;
    tx.sign(authority);

    const txSignature = await this.sendAndConfirm(connection, tx);

    this.logger.log(`USDC sent: ${amount} to ${recipientWallet}, tx=${txSignature}`);

    return { txSignature, aminaWallet: authority.publicKey.toBase58() };
  }

  /**
   * Register a credential on-chain by calling the Anchor program's issue_credential instruction.
   * Accepts an optional programId to target a specific program instance.
   */
  async registerCredential(
    credentialId: string,
    clientReference: string,
    jurisdiction: string,
    riskTier: string,
    productEligibility: string,
    clientWallet: string,
    programId?: string,
  ): Promise<{ credentialPda: string; txSignature: string } | null> {
    if (!this.isConfigured() && !programId) {
      this.logger.warn('AMINA program not configured — skipping credential registration.');
      return null;
    }

    try {
      const connection = this.getConnection();
      const authority = this.getAminaBankKeypair();
      const targetProgramId = this.getProgramPublicKey(programId);

      const [credentialPda] = this.deriveCredentialPda(credentialId, programId);

      // Check if credential PDA already exists on-chain
      const existingAccount = await connection.getAccountInfo(credentialPda);
      if (existingAccount) {
        this.logger.log(`Credential ${credentialId} already registered on-chain: ${credentialPda.toBase58()}`);
        return { credentialPda: credentialPda.toBase58(), txSignature: 'existing' };
      }

      this.logger.log(`Registering credential on-chain: ${credentialId}, wallet=${clientWallet}, PDA=${credentialPda.toBase58()}, program=${targetProgramId.toBase58()}`);

      const discriminator = this.getDiscriminator('issue_credential');
      const instructionData = Buffer.concat([
        discriminator,
        this.serializeString(credentialId),
        this.serializeString(clientReference),
        this.serializeString(jurisdiction),
        this.serializeString(riskTier),
        this.serializeString(productEligibility),
      ]);

      const instruction = new TransactionInstruction({
        programId: targetProgramId,
        keys: [
          { pubkey: credentialPda, isSigner: false, isWritable: true },
          { pubkey: new PublicKey(clientWallet), isSigner: false, isWritable: false },
          { pubkey: authority.publicKey, isSigner: true, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data: instructionData,
      });

      const transaction = new Transaction().add(instruction);
      transaction.feePayer = authority.publicKey;
      const { blockhash } = await connection.getLatestBlockhash('confirmed');
      transaction.recentBlockhash = blockhash;
      transaction.sign(authority);

      const txSignature = await this.sendAndConfirm(connection, transaction);

      this.logger.log(`Credential registered on-chain: ${credentialId}, PDA=${credentialPda.toBase58()}, tx=${txSignature}`);

      return {
        credentialPda: credentialPda.toBase58(),
        txSignature,
      };
    } catch (error: any) {
      this.logger.error(`Failed to register credential ${credentialId} on-chain: ${error.message}`);
      if (error.logs) this.logger.error(`Program logs: ${error.logs.join('\n')}`);
      return null;
    }
  }

  /**
   * Deploy a vault on-chain by calling the Anchor program's create_vault instruction.
   * Accepts an optional programId to target a specific program instance.
   */
  async deployVault(
    vaultId: string,
    credentialId: string,
    baseAsset: string,
    programId?: string,
  ): Promise<{ vaultPda: string; txSignature: string } | null> {
    if (!this.isConfigured() && !programId) {
      this.logger.warn('AMINA program not configured — skipping on-chain vault deployment. Set AMINA_PROGRAM_ID in .env.');
      return null;
    }

    try {
      const connection = this.getConnection();
      const authority = this.getAminaBankKeypair();
      const targetProgramId = this.getProgramPublicKey(programId);

      const [vaultPda] = this.deriveVaultPda(vaultId, programId);
      const [credentialPda] = this.deriveCredentialPda(credentialId, programId);

      this.logger.log(`Deploying vault on-chain: vault=${vaultId}, vaultPda=${vaultPda.toBase58()}, credentialPda=${credentialPda.toBase58()}, program=${targetProgramId.toBase58()}`);

      const discriminator = this.getDiscriminator('create_vault');
      const vaultIdData = this.serializeString(vaultId);
      const baseAssetData = this.serializeString(baseAsset);
      const instructionData = Buffer.concat([discriminator, vaultIdData, baseAssetData]);

      const instruction = new TransactionInstruction({
        programId: targetProgramId,
        keys: [
          { pubkey: vaultPda, isSigner: false, isWritable: true },
          { pubkey: credentialPda, isSigner: false, isWritable: false },
          { pubkey: authority.publicKey, isSigner: true, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data: instructionData,
      });

      const transaction = new Transaction().add(instruction);
      transaction.feePayer = authority.publicKey;
      const { blockhash } = await connection.getLatestBlockhash('confirmed');
      transaction.recentBlockhash = blockhash;
      transaction.sign(authority);

      const txSignature = await this.sendAndConfirm(connection, transaction);

      this.logger.log(`Vault deployed on-chain: vault=${vaultId}, PDA=${vaultPda.toBase58()}, tx=${txSignature}`);

      return {
        vaultPda: vaultPda.toBase58(),
        txSignature,
      };
    } catch (error: any) {
      this.logger.error(`Failed to deploy vault ${vaultId} on-chain: ${error.message}`);
      if (error.logs) this.logger.error(`Program logs: ${error.logs.join('\n')}`);
      return null;
    }
  }
}
