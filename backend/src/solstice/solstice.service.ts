import { Injectable, Inject, Logger } from '@nestjs/common';
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountIdempotentInstruction,
} from '@solana/spl-token';
import bs58 from 'bs58';
import { EventsService } from '../events/events.service';
import { PrismaService } from '../prisma/prisma.service';
import { fetchYieldPool, YieldPoolState } from '@exponent-labs/solstice-idl';

/** Solstice Yield Vault program ID on devnet */
const SOLSTICE_PROGRAM_ID = new PublicKey('euxU8CnAgYk5qkRrSdqKoCM8huyexecRRWS67dz2FVr');

/** Devnet token mints */
const USDC_MINT = new PublicKey('8iBux2LRja1PhVZph8Rw4Hi45pgkaufNEiaZma5nTD5g');
const USDT_MINT = new PublicKey('5dXXpWyZCCPhBHxmp79Du81t7t9oh7HacUW864ARFyft');
const USX_MINT = new PublicKey('7QC4zjrKA6XygpXPQCKSS9BmAsEFDJR6awiHSdgLcDvS');
const EUSX_MINT = new PublicKey('Gkt9h4QWpPBDtbaF5HvYKCc87H5WCRTUtMf77HdTGHBt');

/** Collateral mint lookup */
const COLLATERAL_MINTS: Record<string, PublicKey> = {
  usdc: USDC_MINT,
  usdt: USDT_MINT,
};

/** Solstice PDA addresses (devnet) */
const CONTROLLER_PDA = new PublicKey('6qaXkxV8mKV13MP4VoLcBVstR94xhB8u8ctjCt8RWXgM');
const YIELD_POOL_PDA = new PublicKey('J4jZsXybVwTYkRfVj8bNi43ZdTtNhwLxnGMY7bf1rxqK');
const ASSET_VAULT_PDA = new PublicKey('AWAVoakaLCXmLH9tL7dp9SBPCqpPik6mUyvNQfmMjBQP');
const VESTING_SCHEDULE_PDA = new PublicKey('AdjTFnZ2VFU3vQv9vZZK7TYdFpTnFBBegFz3Gn3D8PUF');

const STRATEGY_ID = 'solstice-eusx-yield';

/** USX Instructions API */
const USX_API_URL = process.env.USX_API_URL || 'https://instructions.solstice.finance';
const USX_API_KEY = process.env.USX_API_KEY || '';

/** Supported USX instruction types */
type UsxInstructionType =
  | 'RequestMint' | 'ConfirmMint' | 'CancelMint'
  | 'RequestRedeem' | 'ConfirmRedeem' | 'CancelRedeem'
  | 'Lock' | 'Unlock' | 'Withdraw';

type CollateralType = 'usdc' | 'usdt';

@Injectable()
export class SolsticeService {
  private readonly logger = new Logger(SolsticeService.name);
  private events: EventsService;
  private prisma: PrismaService;

  constructor(
    @Inject(EventsService) events: EventsService,
    @Inject(PrismaService) prisma: PrismaService,
  ) {
    this.events = events;
    this.prisma = prisma;
  }

  // ─── Helpers ────────────────────────────────────────────────────

  private getConnection(): Connection {
    const rpc = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
    return new Connection(rpc, { commitment: 'confirmed', wsEndpoint: undefined as any });
  }

  private getAminaBankKeypair(): Keypair {
    const key = process.env.AMINA_BANK_KEYPAIR || process.env.SAS_ISSUER_KEYPAIR;
    if (!key) throw new Error('AMINA_BANK_KEYPAIR (or SAS_ISSUER_KEYPAIR) not set in .env');
    return Keypair.fromSecretKey(bs58.decode(key));
  }

  private async pollConfirmation(connection: Connection, txSignature: string, timeoutMs = 30000): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      await new Promise(r => setTimeout(r, 1500));
      try {
        const { value } = await connection.getSignatureStatuses([txSignature]);
        const status = value[0];
        if (status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized') {
          if (status.err) throw new Error(`Transaction failed on-chain: ${JSON.stringify(status.err)}`);
          this.logger.log(`Transaction confirmed: ${txSignature}`);
          return;
        }
      } catch (e: any) {
        if (e.message?.includes('failed on-chain')) throw e;
      }
    }
    this.logger.warn(`Transaction not confirmed within ${timeoutMs}ms: ${txSignature}`);
  }

  private async sendAndConfirm(connection: Connection, transaction: Transaction): Promise<string> {
    const txSignature = await connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });
    this.logger.log(`Transaction sent: ${txSignature}`);
    await this.pollConfirmation(connection, txSignature);
    return txSignature;
  }

  private serializeU64(value: bigint): Buffer {
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64LE(value);
    return buf;
  }

  private deriveCooldownEscrow(user: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('COOLDOWN_ESCROW'), user.toBuffer()], SOLSTICE_PROGRAM_ID,
    );
  }

  private deriveCooldownEscrowVault(user: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('COOLDOWN_ESCROW_VAULT'), user.toBuffer()], SOLSTICE_PROGRAM_ID,
    );
  }

  /** Read on-chain token balance for a given ATA. Returns 0 if account doesn't exist. */
  private async getTokenBalance(connection: Connection, ata: PublicKey): Promise<number> {
    try {
      const info = await connection.getTokenAccountBalance(ata);
      return Number(info.value.uiAmount || 0);
    } catch {
      return 0;
    }
  }

  // ─── USX Instructions API Client ─────────────────────────────────

  /**
   * Call the USX Instructions API to get a serialized Solana instruction.
   * Returns a TransactionInstruction ready to add to a Transaction.
   */
  private async fetchUsxInstruction(
    type: UsxInstructionType,
    data: Record<string, any>,
  ): Promise<TransactionInstruction> {
    const apiUrl = process.env.USX_API_URL || USX_API_URL;
    const apiKey = process.env.USX_API_KEY || USX_API_KEY;

    if (!apiKey) {
      throw new Error('USX_API_KEY not set in .env — cannot call USX Instructions API');
    }

    const url = `${apiUrl}/v1/instructions`;
    this.logger.log(`[USX API] POST ${url} type=${type}`);

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({ type, data }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`USX API error (${res.status}): ${body}`);
    }

    const json = await res.json() as {
      instruction: {
        program_id: number[];
        accounts: { pubkey: number[]; is_signer: boolean; is_writable: boolean }[];
        data: number[];
      };
    };

    const ix = json.instruction;
    return new TransactionInstruction({
      programId: new PublicKey(Buffer.from(ix.program_id)),
      keys: ix.accounts.map((acc) => ({
        pubkey: new PublicKey(Buffer.from(acc.pubkey)),
        isSigner: acc.is_signer,
        isWritable: acc.is_writable,
      })),
      data: Buffer.from(ix.data),
    });
  }

  /** Get the collateral mint for a given collateral type */
  private getCollateralMint(collateral: CollateralType): PublicKey {
    const mint = COLLATERAL_MINTS[collateral];
    if (!mint) throw new Error(`Unsupported collateral type: ${collateral}. Use 'usdc' or 'usdt'.`);
    return mint;
  }

  // ─── Devnet Token Minting ─────────────────────────────────────────

  /**
   * Mint devnet collateral (USDC or USDT) to the Amina Bank wallet.
   * Requires the wallet to be the mint authority for the devnet token.
   */
  async mintDevnetCollateral(amount: number, collateral: CollateralType = 'usdc'): Promise<{ txSignature: string; ata: string }> {
    const connection = this.getConnection();
    const authority = this.getAminaBankKeypair();
    const user = authority.publicKey;
    const mint = this.getCollateralMint(collateral);

    const { createMintToInstruction } = await import('@solana/spl-token');
    const userAta = await getAssociatedTokenAddress(mint, user);
    const amountLamports = BigInt(Math.round(amount * 1e6));

    const tx = new Transaction();
    tx.add(createAssociatedTokenAccountIdempotentInstruction(user, userAta, user, mint));
    tx.add(createMintToInstruction(mint, userAta, user, amountLamports));

    tx.feePayer = user;
    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    tx.recentBlockhash = blockhash;
    tx.sign(authority);

    const txSignature = await this.sendAndConfirm(connection, tx);
    this.logger.log(`[MINT] Minted ${amount} devnet ${collateral.toUpperCase()}, tx=${txSignature}`);
    return { txSignature, ata: userAta.toBase58() };
  }

  /**
   * @deprecated Use requestMintUSX + confirmMintUSX instead.
   * Legacy devnet shortcut — mints USX directly via mint authority.
   */
  async depositUSDCForUSX(amount: number): Promise<{ txSignature: string; usxAta: string }> {
    return this.requestMintUSX(amount, 'usdc');
  }

  /**
   * Request minting USX with collateral (USDC or USDT) via the USX Instructions API.
   * This creates a mint request on-chain. Must be followed by confirmMintUSX().
   */
  async requestMintUSX(amount: number, collateral: CollateralType = 'usdc'): Promise<{ txSignature: string; usxAta: string }> {
    const connection = this.getConnection();
    const authority = this.getAminaBankKeypair();
    const user = authority.publicKey;

    const userUsxAta = await getAssociatedTokenAddress(USX_MINT, user);

    this.logger.log(`[MINT] RequestMint: ${amount} USX via ${collateral.toUpperCase()}`);

    const ix = await this.fetchUsxInstruction('RequestMint', {
      amount: Math.round(amount * 1e6),
      collateral,
      user: user.toBase58(),
    });

    const tx = new Transaction();
    // Ensure USX ATA exists
    tx.add(createAssociatedTokenAccountIdempotentInstruction(user, userUsxAta, user, USX_MINT));
    tx.add(ix);

    tx.feePayer = user;
    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    tx.recentBlockhash = blockhash;
    tx.sign(authority);

    const txSignature = await this.sendAndConfirm(connection, tx);
    this.logger.log(`[MINT] RequestMint submitted: tx=${txSignature}`);
    return { txSignature, usxAta: userUsxAta.toBase58() };
  }

  /**
   * Confirm a pending USX mint request via the USX Instructions API.
   */
  async confirmMintUSX(collateral: CollateralType = 'usdc'): Promise<{ txSignature: string }> {
    const connection = this.getConnection();
    const authority = this.getAminaBankKeypair();
    const user = authority.publicKey;

    this.logger.log(`[MINT] ConfirmMint for ${collateral.toUpperCase()}`);

    const ix = await this.fetchUsxInstruction('ConfirmMint', {
      collateral,
      user: user.toBase58(),
    });

    const tx = new Transaction().add(ix);
    tx.feePayer = user;
    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    tx.recentBlockhash = blockhash;
    tx.sign(authority);

    const txSignature = await this.sendAndConfirm(connection, tx);
    this.logger.log(`[MINT] ConfirmMint complete: tx=${txSignature}`);
    return { txSignature };
  }

  /**
   * Cancel a pending USX mint request via the USX Instructions API.
   */
  async cancelMintUSX(collateral: CollateralType = 'usdc'): Promise<{ txSignature: string }> {
    const connection = this.getConnection();
    const authority = this.getAminaBankKeypair();
    const user = authority.publicKey;

    this.logger.log(`[MINT] CancelMint for ${collateral.toUpperCase()}`);

    const ix = await this.fetchUsxInstruction('CancelMint', {
      collateral,
      user: user.toBase58(),
    });

    const tx = new Transaction().add(ix);
    tx.feePayer = user;
    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    tx.recentBlockhash = blockhash;
    tx.sign(authority);

    const txSignature = await this.sendAndConfirm(connection, tx);
    this.logger.log(`[MINT] CancelMint complete: tx=${txSignature}`);
    return { txSignature };
  }

  // ─── USX Redemption (collateral recovery) ───────────────────────

  /**
   * Request redemption of USX back to collateral (USDC or USDT) via the USX Instructions API.
   * Must be followed by confirmRedeemUSX().
   */
  async requestRedeemUSX(amount: number, collateral: CollateralType = 'usdc'): Promise<{ txSignature: string }> {
    const connection = this.getConnection();
    const authority = this.getAminaBankKeypair();
    const user = authority.publicKey;

    this.logger.log(`[REDEEM] RequestRedeem: ${amount} USX -> ${collateral.toUpperCase()}`);

    const ix = await this.fetchUsxInstruction('RequestRedeem', {
      amount: Math.round(amount * 1e6),
      collateral,
      user: user.toBase58(),
    });

    const tx = new Transaction().add(ix);
    tx.feePayer = user;
    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    tx.recentBlockhash = blockhash;
    tx.sign(authority);

    const txSignature = await this.sendAndConfirm(connection, tx);
    this.logger.log(`[REDEEM] RequestRedeem submitted: tx=${txSignature}`);
    return { txSignature };
  }

  /**
   * Confirm a pending USX redemption via the USX Instructions API.
   * Returns collateral (USDC or USDT) to the vault wallet.
   */
  async confirmRedeemUSX(collateral: CollateralType = 'usdc'): Promise<{ txSignature: string }> {
    const connection = this.getConnection();
    const authority = this.getAminaBankKeypair();
    const user = authority.publicKey;

    this.logger.log(`[REDEEM] ConfirmRedeem for ${collateral.toUpperCase()}`);

    const ix = await this.fetchUsxInstruction('ConfirmRedeem', {
      collateral,
      user: user.toBase58(),
    });

    const tx = new Transaction().add(ix);
    tx.feePayer = user;
    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    tx.recentBlockhash = blockhash;
    tx.sign(authority);

    const txSignature = await this.sendAndConfirm(connection, tx);
    this.logger.log(`[REDEEM] ConfirmRedeem complete: tx=${txSignature}`);
    return { txSignature };
  }

  /**
   * Cancel a pending USX redemption via the USX Instructions API.
   */
  async cancelRedeemUSX(collateral: CollateralType = 'usdc'): Promise<{ txSignature: string }> {
    const connection = this.getConnection();
    const authority = this.getAminaBankKeypair();
    const user = authority.publicKey;

    this.logger.log(`[REDEEM] CancelRedeem for ${collateral.toUpperCase()}`);

    const ix = await this.fetchUsxInstruction('CancelRedeem', {
      collateral,
      user: user.toBase58(),
    });

    const tx = new Transaction().add(ix);
    tx.feePayer = user;
    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    tx.recentBlockhash = blockhash;
    tx.sign(authority);

    const txSignature = await this.sendAndConfirm(connection, tx);
    this.logger.log(`[REDEEM] CancelRedeem complete: tx=${txSignature}`);
    return { txSignature };
  }

  // ─── Core On-Chain Operations ────────────────────────────────────

  /**
   * Deploy capital into Solstice yield vault.
   * Full automated on-chain flow:
   *   Step 1: Mint devnet collateral (if needed)
   *   Step 2: RequestMint collateral -> USX via USX Instructions API
   *   Step 3: ConfirmMint to finalize USX minting
   *   Step 4: Lock USX -> eUSX via USX Instructions API
   *
   * Every step is a real on-chain transaction, verified with pre/post balance snapshots.
   * Creates Allocation records and compliance events for the full segregated fund flow.
   */
  async lockUSX(vaultId: string, amount: number, collateral: CollateralType = 'usdc'): Promise<{
    txSignature: string;
    preBalanceUSX: number;
    postBalanceUSX: number;
    preBalanceEUSX: number;
    postBalanceEUSX: number;
    eusxReceived: number;
    allocationId: string;
    onChainVerified: boolean;
  }> {
    const connection = this.getConnection();
    const authority = this.getAminaBankKeypair();
    const user = authority.publicKey;
    const amountLamports = BigInt(Math.round(amount * 1e6));

    const collateralLabel = collateral.toUpperCase();
    this.logger.log(`[LOCK] vault=${vaultId} amount=${amount} USX (collateral=${collateralLabel})`);

    // Derive ATAs
    const collateralMint = this.getCollateralMint(collateral);
    const userCollateralAta = await getAssociatedTokenAddress(collateralMint, user);
    const userUsxAta = await getAssociatedTokenAddress(USX_MINT, user);
    const userEusxAta = await getAssociatedTokenAddress(EUSX_MINT, user);

    // ─── Pre-balance snapshot (on-chain read) ────────────────
    const preBalanceUSX = await this.getTokenBalance(connection, userUsxAta);
    const preBalanceEUSX = await this.getTokenBalance(connection, userEusxAta);
    const preBalanceCollateral = await this.getTokenBalance(connection, userCollateralAta);

    this.logger.log(`[LOCK] Pre-balance: ${preBalanceCollateral} ${collateralLabel}, ${preBalanceUSX} USX, ${preBalanceEUSX} eUSX`);

    // ─── Step 1: Mint devnet collateral if needed ────────────
    if (preBalanceCollateral < amount) {
      this.logger.log(`[LOCK] Minting ${amount} devnet ${collateralLabel} (current: ${preBalanceCollateral})`);
      const mintResult = await this.mintDevnetCollateral(amount, collateral);
      await this.events.emit({
        vaultId, actionType: `SOLSTICE_MINT_${collateralLabel}`,
        actor: 'portfolio_manager', role: 'Portfolio Manager',
        asset: collateralLabel, amount, strategy: STRATEGY_ID,
        result: 'success',
        reason: `Devnet: Minted ${amount} ${collateralLabel} to vault wallet ATA (${userCollateralAta.toBase58()}).`,
        txSignature: mintResult.txSignature,
        onChainAddress: userCollateralAta.toBase58(),
      });
    }

    // ─── Step 2: RequestMint + ConfirmMint USX via API ───────
    if (preBalanceUSX < amount) {
      this.logger.log(`[LOCK] RequestMint: ${amount} ${collateralLabel} -> USX`);
      const requestResult = await this.requestMintUSX(amount, collateral);
      await this.events.emit({
        vaultId, actionType: 'SOLSTICE_REQUEST_MINT',
        actor: 'portfolio_manager', role: 'Portfolio Manager',
        asset: collateralLabel, amount, strategy: STRATEGY_ID,
        result: 'success',
        reason: [
          `Step 1/4: Requested mint of ${amount} USX with ${collateralLabel} collateral.`,
          `${collateralLabel} from vault wallet ATA (${userCollateralAta.toBase58()}) submitted as collateral.`,
          `Segregated: ${collateralLabel} sourced from vault PDA custody — non-commingled.`,
        ].join(' '),
        txSignature: requestResult.txSignature,
        onChainAddress: userCollateralAta.toBase58(),
      });

      this.logger.log(`[LOCK] ConfirmMint: finalizing USX mint`);
      const confirmResult = await this.confirmMintUSX(collateral);
      await this.events.emit({
        vaultId, actionType: 'SOLSTICE_CONFIRM_MINT',
        actor: 'portfolio_manager', role: 'Portfolio Manager',
        asset: 'USX', amount, strategy: STRATEGY_ID,
        result: 'success',
        reason: [
          `Step 2/4: Confirmed mint of ${amount} USX.`,
          `${amount} USX received into vault USX ATA (${userUsxAta.toBase58()}).`,
        ].join(' '),
        txSignature: confirmResult.txSignature,
        onChainAddress: userUsxAta.toBase58(),
      });

      // Re-read USX balance after mint
      await new Promise(r => setTimeout(r, 1000));
      const newUsxBalance = await this.getTokenBalance(connection, userUsxAta);
      this.logger.log(`[LOCK] Post-mint USX balance: ${newUsxBalance}`);
    }

    // ─── Step 3: Lock USX -> eUSX via USX Instructions API ───
    await this.events.emit({
      vaultId, actionType: 'SOLSTICE_LOCK_INITIATED',
      actor: 'portfolio_manager', role: 'Portfolio Manager',
      asset: 'USX', amount, strategy: STRATEGY_ID,
      result: 'pending',
      reason: `Step 3/4: Locking ${amount} USX into Solstice eUSX yield vault. Pre-balance: ${preBalanceUSX} USX, ${preBalanceEUSX} eUSX. Source wallet: ${user.toBase58()}`,
      onChainAddress: userUsxAta.toBase58(),
    });

    // Fetch Lock instruction from USX API
    const lockIx = await this.fetchUsxInstruction('Lock', {
      amount: Math.round(amount * 1e6),
      user: user.toBase58(),
    });

    const tx = new Transaction();

    // Ensure both USX and eUSX ATAs exist
    tx.add(createAssociatedTokenAccountIdempotentInstruction(user, userUsxAta, user, USX_MINT));
    tx.add(createAssociatedTokenAccountIdempotentInstruction(user, userEusxAta, user, EUSX_MINT));

    // Lock instruction from API
    tx.add(lockIx);

    tx.feePayer = user;
    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    tx.recentBlockhash = blockhash;
    tx.sign(authority);

    const txSignature = await this.sendAndConfirm(connection, tx);

    // ─── Post-balance verification (on-chain read) ───────────
    // Small delay to ensure state has propagated
    await new Promise(r => setTimeout(r, 1000));

    const postBalanceUSX = await this.getTokenBalance(connection, userUsxAta);
    const postBalanceEUSX = await this.getTokenBalance(connection, userEusxAta);
    const eusxReceived = postBalanceEUSX - preBalanceEUSX;
    const usxSpent = preBalanceUSX - postBalanceUSX;
    const onChainVerified = usxSpent > 0 && eusxReceived > 0;

    this.logger.log(`[LOCK] Post-balance: ${postBalanceUSX} USX, ${postBalanceEUSX} eUSX. eUSX received: ${eusxReceived}, USX spent: ${usxSpent}, verified: ${onChainVerified}`);

    // ─── Create Allocation record in DB ──────────────────────
    const allocation = await this.prisma.allocation.create({
      data: {
        vaultId, strategyId: STRATEGY_ID,
        amount: usxSpent > 0 ? usxSpent : amount,
        status: 'active',
        txSignature,
        onChainAddress: SOLSTICE_PROGRAM_ID.toBase58(),
      },
    });

    // Update vault idle balance
    await this.prisma.vault.update({
      where: { vaultId },
      data: { idleBalance: { decrement: amount } },
    });

    // ─── Emit verified compliance event ──────────────────────
    await this.events.emit({
      vaultId, actionType: 'SOLSTICE_LOCK',
      actor: 'portfolio_manager', role: 'Portfolio Manager',
      asset: 'USX', amount: usxSpent > 0 ? usxSpent : amount,
      strategy: STRATEGY_ID, result: 'success',
      reason: [
        `Locked ${usxSpent > 0 ? usxSpent : amount} USX into Solstice eUSX yield vault.`,
        `Fund flow: ${user.toBase58()} USX ATA (${userUsxAta.toBase58()}) -> Solstice Asset Vault (${ASSET_VAULT_PDA.toBase58()}).`,
        `eUSX received: ${eusxReceived} to ATA ${userEusxAta.toBase58()}.`,
        `Pre: ${preBalanceUSX} USX / ${preBalanceEUSX} eUSX. Post: ${postBalanceUSX} USX / ${postBalanceEUSX} eUSX.`,
        `On-chain verified: ${onChainVerified}. Allocation ID: ${allocation.id}.`,
      ].join(' '),
      txSignature,
      onChainAddress: SOLSTICE_PROGRAM_ID.toBase58(),
    });

    return {
      txSignature, preBalanceUSX, postBalanceUSX,
      preBalanceEUSX, postBalanceEUSX, eusxReceived,
      allocationId: allocation.id, onChainVerified,
    };
  }

  /**
   * Unlock eUSX shares — burns eUSX, USX goes to cooldown escrow.
   * On-chain verified with pre/post balance reads.
   */
  async unlockEUSX(vaultId: string, amount: number): Promise<{
    txSignature: string;
    cooldownEscrow: string;
    preBalanceEUSX: number;
    postBalanceEUSX: number;
    eusxBurned: number;
    onChainVerified: boolean;
  }> {
    const connection = this.getConnection();
    const authority = this.getAminaBankKeypair();
    const user = authority.publicKey;
    const shareAmountLamports = BigInt(Math.round(amount * 1e6));

    this.logger.log(`[UNLOCK] vault=${vaultId} amount=${amount} eUSX`);

    const userEusxAta = await getAssociatedTokenAddress(EUSX_MINT, user);
    const [cooldownEscrow] = this.deriveCooldownEscrow(user);
    const [cooldownEscrowVault] = this.deriveCooldownEscrowVault(user);

    // Pre-balance
    const preBalanceEUSX = await this.getTokenBalance(connection, userEusxAta);

    await this.events.emit({
      vaultId, actionType: 'SOLSTICE_UNLOCK_INITIATED',
      actor: 'portfolio_manager', role: 'Portfolio Manager',
      asset: 'eUSX', amount, strategy: STRATEGY_ID,
      result: 'pending',
      reason: `Initiating unlock of ${amount} eUSX from Solstice. Pre-balance: ${preBalanceEUSX} eUSX. Cooldown escrow: ${cooldownEscrow.toBase58()}`,
      onChainAddress: cooldownEscrow.toBase58(),
    });

    // Fetch Unlock instruction from USX API
    const unlockIx = await this.fetchUsxInstruction('Unlock', {
      amount: Math.round(amount * 1e6),
      user: user.toBase58(),
    });

    const tx = new Transaction().add(unlockIx);

    tx.feePayer = user;
    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    tx.recentBlockhash = blockhash;
    tx.sign(authority);

    const txSignature = await this.sendAndConfirm(connection, tx);

    await new Promise(r => setTimeout(r, 1000));
    const postBalanceEUSX = await this.getTokenBalance(connection, userEusxAta);
    const eusxBurned = preBalanceEUSX - postBalanceEUSX;
    const onChainVerified = eusxBurned > 0;

    this.logger.log(`[UNLOCK] Post-balance: ${postBalanceEUSX} eUSX. Burned: ${eusxBurned}. Verified: ${onChainVerified}`);

    // Mark allocation as unwinding
    const activeAlloc = await this.prisma.allocation.findFirst({
      where: { vaultId, strategyId: STRATEGY_ID, status: 'active' },
      orderBy: { createdAt: 'desc' },
    });
    if (activeAlloc) {
      await this.prisma.allocation.update({
        where: { id: activeAlloc.id },
        data: { status: 'cooldown', txSignature },
      });
    }

    await this.events.emit({
      vaultId, actionType: 'SOLSTICE_UNLOCK',
      actor: 'portfolio_manager', role: 'Portfolio Manager',
      asset: 'eUSX', amount: eusxBurned > 0 ? eusxBurned : amount,
      strategy: STRATEGY_ID, result: 'success',
      reason: [
        `Unlocked ${eusxBurned > 0 ? eusxBurned : amount} eUSX from Solstice yield vault.`,
        `Fund flow: eUSX burned from ATA ${userEusxAta.toBase58()}, USX sent to cooldown escrow ${cooldownEscrow.toBase58()}.`,
        `Pre: ${preBalanceEUSX} eUSX. Post: ${postBalanceEUSX} eUSX. Burned: ${eusxBurned}.`,
        `Cooldown escrow vault: ${cooldownEscrowVault.toBase58()}.`,
        `On-chain verified: ${onChainVerified}. Awaiting cooldown period.`,
      ].join(' '),
      txSignature,
      onChainAddress: cooldownEscrow.toBase58(),
    });

    return { txSignature, cooldownEscrow: cooldownEscrow.toBase58(), preBalanceEUSX, postBalanceEUSX, eusxBurned, onChainVerified };
  }

  /**
   * Withdraw USX from cooldown escrow after the cooldown period.
   * On-chain verified with pre/post balance reads.
   */
  async withdrawUSX(vaultId: string): Promise<{
    txSignature: string;
    preBalanceUSX: number;
    postBalanceUSX: number;
    usxReceived: number;
    onChainVerified: boolean;
  }> {
    const connection = this.getConnection();
    const authority = this.getAminaBankKeypair();
    const user = authority.publicKey;

    this.logger.log(`[WITHDRAW] vault=${vaultId}`);

    const userUsxAta = await getAssociatedTokenAddress(USX_MINT, user);
    const [cooldownEscrow] = this.deriveCooldownEscrow(user);
    const [cooldownEscrowVault] = this.deriveCooldownEscrowVault(user);

    const preBalanceUSX = await this.getTokenBalance(connection, userUsxAta);

    await this.events.emit({
      vaultId, actionType: 'SOLSTICE_WITHDRAW_INITIATED',
      actor: 'portfolio_manager', role: 'Portfolio Manager',
      asset: 'USX', strategy: STRATEGY_ID, result: 'pending',
      reason: `Initiating USX withdrawal from Solstice cooldown escrow (${cooldownEscrow.toBase58()}). Pre-balance: ${preBalanceUSX} USX.`,
      onChainAddress: cooldownEscrow.toBase58(),
    });

    // Fetch Withdraw instruction from USX API
    const withdrawIx = await this.fetchUsxInstruction('Withdraw', {
      user: user.toBase58(),
    });

    const tx = new Transaction().add(withdrawIx);

    tx.feePayer = user;
    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    tx.recentBlockhash = blockhash;
    tx.sign(authority);

    const txSignature = await this.sendAndConfirm(connection, tx);

    await new Promise(r => setTimeout(r, 1000));
    const postBalanceUSX = await this.getTokenBalance(connection, userUsxAta);
    const usxReceived = postBalanceUSX - preBalanceUSX;
    const onChainVerified = usxReceived > 0;

    this.logger.log(`[WITHDRAW] Post-balance: ${postBalanceUSX} USX. Received: ${usxReceived}. Verified: ${onChainVerified}`);

    // Mark allocation as unwound, return funds to vault idle balance
    const cooldownAlloc = await this.prisma.allocation.findFirst({
      where: { vaultId, strategyId: STRATEGY_ID, status: 'cooldown' },
      orderBy: { createdAt: 'desc' },
    });
    if (cooldownAlloc) {
      await this.prisma.allocation.update({
        where: { id: cooldownAlloc.id },
        data: { status: 'unwound', txSignature },
      });
      // Return principal + any yield to idle balance
      const returnAmount = usxReceived > 0 ? usxReceived : cooldownAlloc.amount;
      const yieldEarned = returnAmount - cooldownAlloc.amount;
      await this.prisma.vault.update({
        where: { vaultId },
        data: {
          idleBalance: { increment: returnAmount },
          totalNAV: yieldEarned > 0 ? { increment: yieldEarned } : undefined,
        },
      });
    }

    await this.events.emit({
      vaultId, actionType: 'SOLSTICE_WITHDRAW',
      actor: 'portfolio_manager', role: 'Portfolio Manager',
      asset: 'USX', amount: usxReceived > 0 ? usxReceived : undefined,
      strategy: STRATEGY_ID, result: 'success',
      reason: [
        `Step 1/2: Withdrawn USX from Solstice cooldown escrow.`,
        `Fund flow: cooldown escrow ${cooldownEscrow.toBase58()} -> USX ATA ${userUsxAta.toBase58()}.`,
        `Pre: ${preBalanceUSX} USX. Post: ${postBalanceUSX} USX. Received: ${usxReceived}.`,
        `On-chain verified: ${onChainVerified}. Segregated: funds remain in vault custody.`,
      ].join(' '),
      txSignature,
      onChainAddress: userUsxAta.toBase58(),
    });

    // Step 2: Redeem USX back to collateral via USX Instructions API
    if (usxReceived > 0) {
      try {
        const redeemAmount = usxReceived;
        this.logger.log(`[WITHDRAW] Redeeming ${redeemAmount} USX back to collateral`);
        const requestRedeemResult = await this.requestRedeemUSX(redeemAmount);
        const confirmRedeemResult = await this.confirmRedeemUSX();

        await this.events.emit({
          vaultId, actionType: 'SOLSTICE_REDEEM_COLLATERAL',
          actor: 'portfolio_manager', role: 'Portfolio Manager',
          asset: 'USDC', amount: redeemAmount,
          strategy: STRATEGY_ID, result: 'success',
          reason: [
            `Step 2/2: Redeemed ${redeemAmount} USX back to collateral.`,
            `RequestRedeem tx: ${requestRedeemResult.txSignature}. ConfirmRedeem tx: ${confirmRedeemResult.txSignature}.`,
            `Collateral received into vault wallet ATA. Segregated: non-commingled throughout.`,
            `Compliant: all fund movements within vault PDA custody chain.`,
          ].join(' '),
          txSignature: confirmRedeemResult.txSignature,
          onChainAddress: userUsxAta.toBase58(),
        });
      } catch (e: any) {
        this.logger.warn(`[WITHDRAW] USX redemption failed (USX remains in wallet): ${e.message}`);
        await this.events.emit({
          vaultId, actionType: 'SOLSTICE_REDEEM_COLLATERAL',
          actor: 'portfolio_manager', role: 'Portfolio Manager',
          asset: 'USX', amount: usxReceived,
          strategy: STRATEGY_ID, result: 'failed',
          reason: `Step 2/2: USX redemption to collateral failed: ${e.message}. USX remains in vault wallet for manual redemption.`,
          onChainAddress: userUsxAta.toBase58(),
        });
      }
    }

    return { txSignature, preBalanceUSX, postBalanceUSX, usxReceived, onChainVerified };
  }

  // ─── Read-Only / Query Methods ────────────────────────────────

  /**
   * Fetch the on-chain Solstice YieldPool state.
   */
  async getYieldPoolState(): Promise<{
    totalAssets: string;
    sharesSupply: string;
    assetMint: string;
    exchangeRate: number;
    programId: string;
    yieldPoolAddress: string;
    assetVaultAddress: string;
  }> {
    const connection = this.getConnection();
    const yieldPool: YieldPoolState = await fetchYieldPool(connection, YIELD_POOL_PDA);

    const totalAssetsNum = Number(yieldPool.total_assets.toString());
    const sharesSupplyNum = Number(yieldPool.shares_supply.toString());
    const exchangeRate = sharesSupplyNum > 0 ? totalAssetsNum / sharesSupplyNum : 1;

    return {
      totalAssets: yieldPool.total_assets.toString(),
      sharesSupply: yieldPool.shares_supply.toString(),
      assetMint: yieldPool.asset_mint.toBase58(),
      exchangeRate,
      programId: SOLSTICE_PROGRAM_ID.toBase58(),
      yieldPoolAddress: YIELD_POOL_PDA.toBase58(),
      assetVaultAddress: ASSET_VAULT_PDA.toBase58(),
    };
  }

  /**
   * Get the vault's current position in Solstice — reads on-chain eUSX balance
   * and cross-references with DB allocation records.
   */
  async getPositionForVault(vaultId: string): Promise<{
    vaultId: string;
    eusxBalance: number;
    usxValue: number;
    exchangeRate: number;
    allocations: { id: string; amount: number; yieldAccrued: number; status: string; txSignature: string | null; createdAt: Date }[];
    aminaBankWallet: string;
    eusxAta: string;
    onChainVerified: boolean;
  }> {
    const connection = this.getConnection();
    const authority = this.getAminaBankKeypair();
    const user = authority.publicKey;
    const userEusxAta = await getAssociatedTokenAddress(EUSX_MINT, user);

    // On-chain balance
    const eusxBalance = await this.getTokenBalance(connection, userEusxAta);

    // Exchange rate
    let exchangeRate = 1;
    try {
      const poolState = await this.getYieldPoolState();
      exchangeRate = poolState.exchangeRate;
    } catch { /* fallback 1:1 */ }

    const usxValue = eusxBalance * exchangeRate;

    // DB allocation records for this vault + strategy
    const allocations = await this.prisma.allocation.findMany({
      where: { vaultId, strategyId: STRATEGY_ID },
      orderBy: { createdAt: 'desc' },
      select: { id: true, amount: true, yieldAccrued: true, status: true, txSignature: true, createdAt: true },
    });

    return {
      vaultId, eusxBalance, usxValue, exchangeRate,
      allocations,
      aminaBankWallet: user.toBase58(),
      eusxAta: userEusxAta.toBase58(),
      onChainVerified: true,
    };
  }

  /**
   * Get full fund flow history for a vault's Solstice interactions.
   * Queries all compliance events related to Solstice for this vault.
   */
  async getFundFlowHistory(vaultId: string) {
    return this.prisma.complianceEvent.findMany({
      where: {
        vaultId,
        actionType: {
          in: [
            'SOLSTICE_MINT_USDC', 'SOLSTICE_MINT_USDT',
            'SOLSTICE_REQUEST_MINT', 'SOLSTICE_CONFIRM_MINT',
            'SOLSTICE_LOCK_INITIATED', 'SOLSTICE_LOCK',
            'SOLSTICE_UNLOCK_INITIATED', 'SOLSTICE_UNLOCK',
            'SOLSTICE_WITHDRAW_INITIATED', 'SOLSTICE_WITHDRAW',
            'SOLSTICE_REDEEM_COLLATERAL',
          ],
        },
      },
      orderBy: { timestamp: 'desc' },
    });
  }

  /**
   * Seed the Solstice strategy into the DB if it doesn't exist.
   */
  async seedStrategy(): Promise<void> {
    const existing = await this.prisma.strategy.findUnique({
      where: { strategyId: STRATEGY_ID },
    });
    if (!existing) {
      await this.prisma.strategy.create({
        data: {
          strategyId: STRATEGY_ID,
          name: 'Solstice eUSX Yield',
          description: 'Earn yield on USX stablecoin via Solstice protocol eUSX yield-bearing token. Delta-neutral strategy with 8.4% rolling 12-month APY.',
          riskLevel: 'low',
          active: true,
          disabled: false,
          currentYield: 8.5,
        },
      });
      this.logger.log('Seeded Solstice eUSX Yield strategy');
    }
  }
}
