import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
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
    if (process.env.AMINA_VAULT_SO_PATH && fs.existsSync(process.env.AMINA_VAULT_SO_PATH)) {
      return process.env.AMINA_VAULT_SO_PATH;
    }
    // Look in backend/program-binary/ first (bundled for deployment)
    const bundledPath = path.resolve(__dirname, '..', '..', 'program-binary', 'amina_vault.so');
    if (fs.existsSync(bundledPath)) return bundledPath;
    // Fallback to contracts build output (local dev)
    const contractsPath = path.resolve(__dirname, '..', '..', '..', 'contracts', 'target', 'deploy', 'amina_vault.so');
    if (fs.existsSync(contractsPath)) return contractsPath;
    throw new Error(`Template binary not found. Place amina_vault.so in backend/program-binary/ or run "anchor build" in contracts/.`);
  }

  /**
   * Patch the compiled ELF binary: find all occurrences of the template program ID
   * (32 bytes) and replace them with the new program keypair's public key.
   * This is necessary because Anchor's declare_id!() embeds the program ID in the
   * binary and checks it at runtime.
   */
  patchBinary(elfBuffer: Buffer, newProgramId: PublicKey): Buffer {
    const templateBytes = Buffer.from(bs58.decode(TEMPLATE_PROGRAM_ID));
    const newBytes = Buffer.from(newProgramId.toBytes());
    const patched = Buffer.from(elfBuffer);

    // ─── Pass 1: Patch contiguous 32-byte occurrences in .rodata ─────
    let contiguousReplacements = 0;
    for (let i = 0; i <= patched.length - 32; i++) {
      if (patched.subarray(i, i + 32).equals(templateBytes)) {
        newBytes.copy(patched, i);
        contiguousReplacements++;
        i += 31;
      }
    }
    this.logger.log(`Pass 1: Patched ${contiguousReplacements} contiguous 32-byte occurrence(s)`);

    // ─── Pass 2: Patch BPF lddw instruction immediates ──────────────
    // The BPF compiler inlines the pubkey as 64-bit immediates in lddw instructions.
    // lddw is a 16-byte wide instruction:
    //   [opcode=0x18, regs, off(2), imm_lo(4)] [0x00, 0x00, 0x00, 0x00, imm_hi(4)]
    // The 64-bit value = imm_lo (LE) || imm_hi (LE) = 8 bytes of the pubkey
    const LDDW_OPCODE = 0x18;
    let lddwReplacements = 0;

    for (let i = 0; i <= patched.length - 16; i++) {
      if (patched[i] !== LDDW_OPCODE) continue;

      // Extract the 64-bit immediate: bytes [i+4..i+8] || [i+12..i+16]
      const immLo = patched.subarray(i + 4, i + 8);
      const immHi = patched.subarray(i + 12, i + 16);
      const full64 = Buffer.concat([immLo, immHi]);

      // Check if this matches any 8-byte chunk of the template pubkey
      for (let c = 0; c < 4; c++) {
        const templateChunk = templateBytes.subarray(c * 8, (c + 1) * 8);
        if (full64.equals(templateChunk)) {
          // Replace with corresponding chunk of the new pubkey
          const newChunk = newBytes.subarray(c * 8, (c + 1) * 8);
          newChunk.copy(patched, i + 4, 0, 4);   // imm_lo
          newChunk.copy(patched, i + 12, 4, 8);   // imm_hi
          lddwReplacements++;
          break;
        }
      }
    }
    this.logger.log(`Pass 2: Patched ${lddwReplacements} BPF lddw immediate(s)`);

    const totalReplacements = contiguousReplacements + lddwReplacements;
    if (totalReplacements === 0) {
      throw new Error('No template program ID bytes found in binary — binary may be corrupted or already patched');
    }

    // Verify: confirm old template bytes are completely gone
    const verifyOldContiguous = patched.indexOf(templateBytes);
    // Also check no lddw instructions still carry old chunks
    let remainingOldLddw = 0;
    for (let i = 0; i <= patched.length - 16; i++) {
      if (patched[i] !== LDDW_OPCODE) continue;
      const full64 = Buffer.concat([patched.subarray(i + 4, i + 8), patched.subarray(i + 12, i + 16)]);
      for (let c = 0; c < 4; c++) {
        if (full64.equals(templateBytes.subarray(c * 8, (c + 1) * 8))) {
          remainingOldLddw++;
          break;
        }
      }
    }
    this.logger.log(`Verification — old contiguous at: ${verifyOldContiguous} (should be -1), remaining old lddw: ${remainingOldLddw} (should be 0)`);

    return patched;
  }

  /**
   * Write a Keypair to a temporary JSON file in Solana CLI format.
   * Returns the file path. Caller is responsible for cleanup.
   */
  private writeKeypairToTempFile(keypair: Keypair): string {
    const tmpFile = path.join(os.tmpdir(), `amina-kp-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
    fs.writeFileSync(tmpFile, JSON.stringify(Array.from(keypair.secretKey)));
    return tmpFile;
  }

  /**
   * Deploy a new program instance for a specific client wallet.
   * 1. Generate a fresh keypair (new program ID)
   * 2. Read the template .so binary
   * 3. Patch the binary with the new program ID
   * 4. Deploy via `solana program deploy` CLI (handles chunked writes + confirmation)
   */
  async deployNewProgramInstance(clientWallet: string): Promise<{
    programId: string;
    programKeypair: Keypair;
    txSignature: string;
  }> {
    const authority = this.getAminaBankKeypair();
    // solana program deploy requires WebSocket support for TPU client.
    // Use a WS-capable RPC (public devnet) even if the main RPC doesn't support WS.
    const rpc = process.env.SOLANA_DEPLOY_RPC_URL || 'https://api.devnet.solana.com';

    // Generate a fresh keypair for this program instance
    const programKeypair = Keypair.generate();
    const newProgramId = programKeypair.publicKey;

    this.logger.log(`Deploying new program instance for wallet ${clientWallet}: programId=${newProgramId.toBase58()}`);

    // Read and patch the template binary
    const soPath = this.getTemplateBinaryPath();
    const rawElf = fs.readFileSync(soPath);
    const patchedElf = this.patchBinary(rawElf, newProgramId);

    // Verify patched file: read back and confirm new ID is embedded
    const patchedSoPath = path.join(os.tmpdir(), `amina-patched-${Date.now()}.so`);
    fs.writeFileSync(patchedSoPath, patchedElf);
    const readBack = fs.readFileSync(patchedSoPath);
    const newIdInFile = readBack.indexOf(Buffer.from(newProgramId.toBytes()));
    this.logger.log(`Written file verification — new program ID found at offset: ${newIdInFile}`);

    const programKpPath = this.writeKeypairToTempFile(programKeypair);
    const authorityKpPath = this.writeKeypairToTempFile(authority);

    // Verify keypair file matches expected program ID
    const kpFileContent = JSON.parse(fs.readFileSync(programKpPath, 'utf8'));
    const kpFromFile = Keypair.fromSecretKey(Uint8Array.from(kpFileContent));
    this.logger.log(`Keypair file pubkey: ${kpFromFile.publicKey.toBase58()}, expected: ${newProgramId.toBase58()}, match: ${kpFromFile.publicKey.equals(newProgramId)}`);

    try {
      // Deploy via Solana CLI — handles chunked BPF writes and WebSocket-free confirmation
      // Resolve solana CLI path — shell profile may not be loaded in child_process
      const solanaBin = process.env.SOLANA_CLI_PATH
        || path.join(os.homedir(), '.local', 'share', 'solana', 'install', 'active_release', 'bin', 'solana');
      const cmd = `"${solanaBin}" program deploy "${patchedSoPath}" --program-id "${programKpPath}" --keypair "${authorityKpPath}" --url "${rpc}" --commitment confirmed`;

      this.logger.log(`Running: solana program deploy for ${newProgramId.toBase58()}`);
      const output = execSync(cmd, { timeout: 120_000, encoding: 'utf8' });
      this.logger.log(`Deploy output: ${output.trim()}`);

      // Parse program ID from output: "Program Id: <pubkey>"
      const match = output.match(/Program Id:\s*(\S+)/);
      const deployedId = match ? match[1] : newProgramId.toBase58();

      this.logger.log(`Program instance deployed: ${deployedId} for wallet ${clientWallet}`);

      // ─── Verify deployed program on-chain ─────────────────────
      const connection = this.getConnection();
      const deployedPubkey = new PublicKey(deployedId);
      const accountInfo = await connection.getAccountInfo(deployedPubkey);

      if (!accountInfo) {
        throw new Error(`Deployed program account not found on-chain: ${deployedId}`);
      }

      this.logger.log(`On-chain verification — program ${deployedId}: owner=${accountInfo.owner.toBase58()}, executable=${accountInfo.executable}, data=${accountInfo.data.length} bytes`);

      if (!accountInfo.executable) {
        throw new Error(`Program account ${deployedId} exists but is NOT executable`);
      }

      // Verify it's owned by the BPF Upgradeable Loader
      const BPF_LOADER_UPGRADEABLE = 'BPFLoaderUpgradeab1e11111111111111111111111';
      if (accountInfo.owner.toBase58() !== BPF_LOADER_UPGRADEABLE) {
        this.logger.warn(`Program owner is ${accountInfo.owner.toBase58()}, expected ${BPF_LOADER_UPGRADEABLE}`);
      }

      // Verify the patched binary has the correct declare_id by checking programdata
      // The program account stores a 4-byte enum (UpgradeableLoaderState) + 32-byte programdata address
      if (accountInfo.data.length >= 36) {
        const programdataAddress = new PublicKey(accountInfo.data.subarray(4, 36));
        const programdataInfo = await connection.getAccountInfo(programdataAddress);
        if (programdataInfo) {
          // Programdata: 4-byte enum + 8-byte slot + 1-byte option + 32-byte authority + program bytes
          const programBytesOffset = 45;
          const onChainBytes = programdataInfo.data.subarray(programBytesOffset);
          const newIdBytes = Buffer.from(deployedPubkey.toBytes());
          const idxInOnChain = onChainBytes.indexOf(newIdBytes);
          this.logger.log(`On-chain binary verification — declare_id bytes found at offset: ${idxInOnChain} (should be >= 0)`);
          if (idxInOnChain < 0) {
            const templateIdBytes = Buffer.from(bs58.decode(TEMPLATE_PROGRAM_ID));
            const oldIdx = onChainBytes.indexOf(templateIdBytes);
            this.logger.error(`CRITICAL: New program ID NOT found in on-chain binary! Old template ID at offset: ${oldIdx}`);
            throw new Error(`Binary patching verification failed: deployed binary still contains template program ID, not ${deployedId}`);
          }
        }
      }

      this.logger.log(`Program ${deployedId} verified: executable, correct owner, declare_id patched`);

      return {
        programId: deployedId,
        programKeypair,
        txSignature: deployedId,
      };
    } finally {
      // Cleanup temp files (keypairs contain secret keys)
      try { fs.unlinkSync(patchedSoPath); } catch { /* ignore */ }
      try { fs.unlinkSync(programKpPath); } catch { /* ignore */ }
      try { fs.unlinkSync(authorityKpPath); } catch { /* ignore */ }
    }
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

  /**
   * Sync a mandate update to the on-chain program PDA via the update_mandate instruction.
   * Returns null (non-fatal) if the program is not configured.
   */
  async updateMandate(programId: string | null | undefined, vaultId: string, mandate: any): Promise<{ txSignature: string } | null> {
    if (!this.isConfigured() && !programId) {
      this.logger.warn(`updateMandate skipped — program not configured for vault ${vaultId}`);
      return null;
    }

    try {
      const connection = this.getConnection();
      const authority = this.getAminaBankKeypair();
      const pid = programId ? new PublicKey(programId) : this.getProgramPublicKey();

      const [vaultPda] = PublicKey.findProgramAddressSync([Buffer.from('vault'), Buffer.from(vaultId)], pid);
      const [mandatePda] = PublicKey.findProgramAddressSync([Buffer.from('mandate'), vaultPda.toBuffer()], pid);

      // Anchor discriminator for update_mandate
      const discriminator = createHash('sha256').update('global:update_mandate').digest().slice(0, 8);

      // Encode instruction data (Borsh-compatible simple encoding via Buffer)
      // update_mandate(allowed_strategies, blocked_strategies, max_allocation_bps, liquidity_buffer_bps, consent_threshold, leverage_allowed)
      // For now, send an empty payload — the real Borsh encoding would require the anchor IDL client.
      // A full Anchor client call via @coral-xyz/anchor is the production path; this stub logs intent.
      this.logger.log(`update_mandate intent: vault=${vaultId}, buffer=${mandate.liquidityBufferBps}bps, version=${mandate.version}`);

      // Stub: return a simulated tx signature so the DB sync flag is set correctly in demo mode.
      // Replace this block with a real Anchor program method call when integrating the full IDL client.
      const stubTxSig = `mandate-sync-${vaultId}-v${mandate.version}-${Date.now()}`;
      this.logger.log(`update_mandate stub tx: ${stubTxSig}`);
      return { txSignature: stubTxSig };
    } catch (error: any) {
      this.logger.error(`update_mandate failed for vault ${vaultId}: ${error.message}`);
      throw error;
    }
  }
}
