import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import {
  Connection,
  PublicKey,
  GetProgramAccountsFilter,
} from '@solana/web3.js';
import bs58 from 'bs58';

/**
 * Service to read GLEntry and RegulatoryReport PDAs from the mock-finstar Anchor program.
 * Uses raw @solana/web3.js (NOT @coral-xyz/anchor) for minimal dependencies.
 * Follows the same pattern as VaultProgramService.
 */
@Injectable()
export class FinstarService {
  private readonly logger = new Logger(FinstarService.name);

  private getProgramPublicKey(): PublicKey {
    const id = process.env.MOCK_FINSTAR_PROGRAM_ID || '7jH9Lhe9Ny3a8LxUsS3BCSHoDKmQZz5Vpu1py4pemisF';
    return new PublicKey(id);
  }

  private getConnection(): Connection {
    const rpc = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
    return new Connection(rpc, { commitment: 'confirmed', wsEndpoint: undefined as any });
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
   * Borsh-deserialize a string: 4-byte LE length prefix + UTF-8 bytes
   */
  private deserializeString(buffer: Buffer, offset: number): { value: string; offset: number } {
    const len = buffer.readUInt32LE(offset);
    const value = buffer.subarray(offset + 4, offset + 4 + len).toString('utf8');
    return { value, offset: offset + 4 + len };
  }

  /**
   * Derive the FinstarConfig PDA: seeds = [b"finstar_config"]
   */
  private deriveConfigPda(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('finstar_config')],
      this.getProgramPublicKey(),
    );
  }

  /**
   * Derive a GLEntry PDA: seeds = [b"gl_entry", entry_id.as_bytes()]
   */
  private deriveGLEntryPda(entryId: string): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('gl_entry'), Buffer.from(entryId)],
      this.getProgramPublicKey(),
    );
  }

  /**
   * Derive a RegulatoryReport PDA: seeds = [b"reg_report", report_id.as_bytes()]
   */
  private deriveRegulatoryReportPda(reportId: string): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('reg_report'), Buffer.from(reportId)],
      this.getProgramPublicKey(),
    );
  }

  /**
   * Deserialize a GLEntry account data (after the 8-byte Anchor discriminator).
   * Fields (in Borsh order):
   * - entry_id: String
   * - entry_type: u8 enum (Deposit=0, Withdrawal=1, YieldAccrual=2, FeeDebit=3, StrategyAllocation=4, StrategyUnwind=5, Transfer=6)
   * - vault_id: String
   * - amount: u64 LE
   * - currency: String
   * - debit_account: String
   * - credit_account: String
   * - narrative: String
   * - source_tx_signature: String
   * - regulatory_tag: String
   * - swift_ref: String
   * - status: u8 enum (Pending=0, Posted=1, Reversed=2)
   * - posted_at: i64 LE
   */
  private deserializeGLEntry(data: Buffer): any {
    let offset = 8; // skip 8-byte Anchor discriminator

    const entryIdResult = this.deserializeString(data, offset);
    const entryId = entryIdResult.value;
    offset = entryIdResult.offset;

    const entryTypeRaw = data.readUInt8(offset);
    offset += 1;
    const entryTypeMap = ['Deposit', 'Withdrawal', 'YieldAccrual', 'FeeDebit', 'StrategyAllocation', 'StrategyUnwind', 'Transfer'];
    const entryType = entryTypeMap[entryTypeRaw] || 'Unknown';

    const vaultIdResult = this.deserializeString(data, offset);
    const vaultId = vaultIdResult.value;
    offset = vaultIdResult.offset;

    const amount = data.readBigUInt64LE(offset);
    offset += 8;

    const currencyResult = this.deserializeString(data, offset);
    const currency = currencyResult.value;
    offset = currencyResult.offset;

    const debitAccountResult = this.deserializeString(data, offset);
    const debitAccount = debitAccountResult.value;
    offset = debitAccountResult.offset;

    const creditAccountResult = this.deserializeString(data, offset);
    const creditAccount = creditAccountResult.value;
    offset = creditAccountResult.offset;

    const narrativeResult = this.deserializeString(data, offset);
    const narrative = narrativeResult.value;
    offset = narrativeResult.offset;

    const sourceTxResult = this.deserializeString(data, offset);
    const sourceTxSignature = sourceTxResult.value;
    offset = sourceTxResult.offset;

    const regulatoryTagResult = this.deserializeString(data, offset);
    const regulatoryTag = regulatoryTagResult.value;
    offset = regulatoryTagResult.offset;

    const swiftRefResult = this.deserializeString(data, offset);
    const swiftRef = swiftRefResult.value;
    offset = swiftRefResult.offset;

    const statusRaw = data.readUInt8(offset);
    offset += 1;
    const statusMap = ['Pending', 'Posted', 'Reversed'];
    const status = statusMap[statusRaw] || 'Unknown';

    const postedAt = data.readBigInt64LE(offset);
    offset += 8;

    return {
      entryId,
      entryType,
      vaultId,
      amount: amount.toString(),
      currency,
      debitAccount,
      creditAccount,
      narrative,
      sourceTxSignature,
      regulatoryTag,
      swiftRef,
      status,
      postedAt: postedAt.toString(),
    };
  }

  /**
   * Get the FinstarConfig PDA account.
   */
  async getConfig(): Promise<any> {
    try {
      const connection = this.getConnection();
      const [configPda] = this.deriveConfigPda();

      this.logger.log(`Reading FinstarConfig PDA: ${configPda.toBase58()}`);

      const accountInfo = await connection.getAccountInfo(configPda);
      if (!accountInfo) {
        this.logger.warn(`FinstarConfig PDA not found: ${configPda.toBase58()}`);
        return null;
      }

      // For config, we'll just return basic info since the structure isn't specified
      return {
        pda: configPda.toBase58(),
        owner: accountInfo.owner.toBase58(),
        dataLength: accountInfo.data.length,
      };
    } catch (error: any) {
      this.logger.error(`Failed to read FinstarConfig: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get a single GLEntry by entry ID.
   */
  async getEntry(entryId: string): Promise<any> {
    try {
      const connection = this.getConnection();
      const [entryPda] = this.deriveGLEntryPda(entryId);

      this.logger.log(`Reading GLEntry PDA: ${entryPda.toBase58()} for entryId=${entryId}`);

      const accountInfo = await connection.getAccountInfo(entryPda);
      if (!accountInfo) {
        this.logger.warn(`GLEntry not found: ${entryId}`);
        return null;
      }

      const entry = this.deserializeGLEntry(accountInfo.data);
      return {
        ...entry,
        pda: entryPda.toBase58(),
      };
    } catch (error: any) {
      this.logger.error(`Failed to read GLEntry ${entryId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get all GLEntry PDAs for a specific vault using getProgramAccounts with memcmp filter.
   */
  async getGLEntries(vaultId: string): Promise<any[]> {
    try {
      const connection = this.getConnection();
      const programId = this.getProgramPublicKey();

      this.logger.log(`Fetching GLEntries for vault: ${vaultId}`);

      // The vault_id field starts at offset 8 (discriminator) + 4 (entry_id length) + entry_id.len + 1 (entry_type)
      // For a memcmp filter, we need to know the exact offset. This is tricky because entry_id is variable length.
      // We'll use a more lenient approach: fetch all GLEntry accounts and filter in-memory.

      const discriminator = this.getDiscriminator('gl_entry');

      const filters: GetProgramAccountsFilter[] = [
        {
          memcmp: {
            offset: 0,
            bytes: bs58.encode(discriminator),
          },
        },
      ];

      const accounts = await connection.getProgramAccounts(programId, {
        filters,
        commitment: 'confirmed',
      });

      this.logger.log(`Found ${accounts.length} GLEntry accounts, filtering by vaultId=${vaultId}`);

      const entries: any[] = [];
      for (const account of accounts) {
        try {
          const entry = this.deserializeGLEntry(account.account.data);
          if (entry.vaultId === vaultId) {
            entries.push({
              ...entry,
              pda: account.pubkey.toBase58(),
            });
          }
        } catch (error: any) {
          this.logger.warn(`Failed to deserialize GLEntry at ${account.pubkey.toBase58()}: ${error.message}`);
        }
      }

      this.logger.log(`Filtered to ${entries.length} GLEntries for vaultId=${vaultId}`);
      return entries;
    } catch (error: any) {
      this.logger.error(`Failed to fetch GLEntries for vault ${vaultId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get all RegulatoryReport PDAs for a specific vault using getProgramAccounts with memcmp filter.
   */
  async getRegulatoryReports(vaultId: string): Promise<any[]> {
    try {
      const connection = this.getConnection();
      const programId = this.getProgramPublicKey();

      this.logger.log(`Fetching RegulatoryReports for vault: ${vaultId}`);

      // Similar approach: fetch all RegulatoryReport accounts and filter in-memory
      const discriminator = this.getDiscriminator('regulatory_report');

      const filters: GetProgramAccountsFilter[] = [
        {
          memcmp: {
            offset: 0,
            bytes: bs58.encode(discriminator),
          },
        },
      ];

      const accounts = await connection.getProgramAccounts(programId, {
        filters,
        commitment: 'confirmed',
      });

      this.logger.log(`Found ${accounts.length} RegulatoryReport accounts (filtering not yet implemented)`);

      // For now, return basic info since deserialization structure isn't specified
      const reports = accounts.map(account => ({
        pda: account.pubkey.toBase58(),
        owner: account.account.owner.toBase58(),
        dataLength: account.account.data.length,
      }));

      return reports;
    } catch (error: any) {
      this.logger.error(`Failed to fetch RegulatoryReports for vault ${vaultId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Aggregate GL entries for a vault: compute total debits, credits, and running balance.
   */
  async getVaultLedger(vaultId: string): Promise<any> {
    try {
      const entries = await this.getGLEntries(vaultId);

      let totalDebits = BigInt(0);
      let totalCredits = BigInt(0);

      for (const entry of entries) {
        const amount = BigInt(entry.amount);

        // Simple heuristic: entry types that typically debit
        if (['Withdrawal', 'FeeDebit', 'StrategyAllocation'].includes(entry.entryType)) {
          totalDebits += amount;
        } else {
          // Deposit, YieldAccrual, StrategyUnwind, Transfer typically credit
          totalCredits += amount;
        }
      }

      const runningBalance = totalCredits - totalDebits;

      return {
        vaultId,
        totalDebits: totalDebits.toString(),
        totalCredits: totalCredits.toString(),
        runningBalance: runningBalance.toString(),
        entryCount: entries.length,
        entries,
      };
    } catch (error: any) {
      this.logger.error(`Failed to compute vault ledger for ${vaultId}: ${error.message}`);
      throw error;
    }
  }
}
