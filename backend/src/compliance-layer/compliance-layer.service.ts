import { Injectable, Logger, Inject } from '@nestjs/common';
import { createHash } from 'crypto';
import {
  Connection,
  PublicKey,
} from '@solana/web3.js';
import bs58 from 'bs58';
import { PrismaService } from '../prisma/prisma.service';

/**
 * BorshReader utility for manual Borsh deserialization.
 * Reads primitive types and strings from a Buffer following Borsh format.
 */
class BorshReader {
  private offset = 0;

  constructor(private data: Buffer) {}

  readString(): string {
    const len = this.data.readUInt32LE(this.offset);
    this.offset += 4;
    const str = this.data.subarray(this.offset, this.offset + len).toString('utf8');
    this.offset += len;
    return str;
  }

  readU8(): number {
    const value = this.data.readUInt8(this.offset);
    this.offset += 1;
    return value;
  }

  readU64(): bigint {
    const value = this.data.readBigUInt64LE(this.offset);
    this.offset += 8;
    return value;
  }

  readI64(): bigint {
    const value = this.data.readBigInt64LE(this.offset);
    this.offset += 8;
    return value;
  }

  readBool(): boolean {
    const value = this.data.readUInt8(this.offset);
    this.offset += 1;
    return value !== 0;
  }

  readPubkey(): string {
    const bytes = this.data.subarray(this.offset, this.offset + 32);
    this.offset += 32;
    return bs58.encode(bytes);
  }

  readVecString(): string[] {
    const len = this.data.readUInt32LE(this.offset);
    this.offset += 4;
    const result: string[] = [];
    for (let i = 0; i < len; i++) {
      result.push(this.readString());
    }
    return result;
  }

  skip(n: number): void {
    this.offset += n;
  }
}

/**
 * Service to read on-chain compliance data from three mock compliance programs:
 * - mock-notabene (Travel Rule / VASP registry)
 * - mock-mesh (Venue Routing)
 * - mock-jurisdiction-engine (Jurisdiction Rules & Attestations)
 *
 * Uses raw @solana/web3.js (NOT Anchor SDK) with manual Borsh deserialization.
 */
@Injectable()
export class ComplianceLayerService {
  private readonly logger = new Logger(ComplianceLayerService.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async runHealthCheck(): Promise<{ overallScore: number; checks: Array<{ name: string; status: string; detail: string }> }> {
    const checks: Array<{ name: string; status: string; detail: string }> = [];

    const runCheck = async (
      name: string,
      fn: () => Promise<{ pass: boolean; detail: string }>,
    ) => {
      try {
        const result = await fn();
        checks.push({ name, status: result.pass ? 'pass' : 'fail', detail: result.detail });
      } catch (error: any) {
        checks.push({ name, status: 'fail', detail: `Error: ${error.message}` });
      }
    };

    await runCheck('Database Connectivity', async () => {
      const count = await this.prisma.adminUser.count();
      return { pass: true, detail: `Database reachable — ${count} admin user(s) found` };
    });

    await runCheck('Active Credentials', async () => {
      const count = await this.prisma.credential.count({ where: { status: 'active' } });
      return {
        pass: count > 0,
        detail: count > 0 ? `${count} active credential(s) found` : 'No active credentials',
      };
    });

    await runCheck('Active Vaults', async () => {
      const count = await this.prisma.vault.count({ where: { status: 'active' } });
      return {
        pass: count > 0,
        detail: count > 0 ? `${count} active vault(s) found` : 'No active vaults',
      };
    });

    await runCheck('Mandate Enforcement', async () => {
      const count = await this.prisma.mandate.count({
        where: { allowedStrategies: { isEmpty: false } },
      });
      return {
        pass: count > 0,
        detail: count > 0 ? `${count} mandate(s) with allowed strategies` : 'No mandates with allowed strategies',
      };
    });

    await runCheck('Consent Configuration', async () => {
      const count = await this.prisma.mandate.count({
        where: { consentThreshold: { gt: 0 } },
      });
      return {
        pass: count > 0,
        detail: count > 0 ? `${count} mandate(s) with consent threshold configured` : 'No mandates with consent threshold',
      };
    });

    await runCheck('Strategy Registry', async () => {
      const count = await this.prisma.strategy.count({ where: { active: true } });
      return {
        pass: count > 0,
        detail: count > 0 ? `${count} active strategy/strategies registered` : 'No active strategies',
      };
    });

    await runCheck('Event Logging', async () => {
      const count = await this.prisma.complianceEvent.count();
      return {
        pass: count > 0,
        detail: count > 0 ? `${count} compliance event(s) logged` : 'No compliance events found',
      };
    });

    await runCheck('Deposit Provenance', async () => {
      const count = await this.prisma.deposit.count({
        where: { sourceReference: { not: '' } },
      });
      return {
        pass: count > 0,
        detail: count > 0 ? `${count} deposit(s) with source reference` : 'No deposits with source reference',
      };
    });

    await runCheck('Destination Whitelist', async () => {
      const count = await this.prisma.mandate.count({
        where: { approvedDestinations: { isEmpty: false } },
      });
      return {
        pass: count > 0,
        detail: count > 0 ? `${count} mandate(s) with approved destinations` : 'No mandates with approved destinations',
      };
    });

    await runCheck('Translation Layer', async () => {
      const count = await this.prisma.complianceEvent.count({
        where: { actionType: { startsWith: 'TL_' } },
      });
      return {
        pass: count > 0,
        detail: count > 0 ? `${count} translation layer event(s) found` : 'No translation layer events found',
      };
    });

    const passes = checks.filter((c) => c.status === 'pass').length;
    const overallScore = Math.round((passes / checks.length) * 100);

    return { overallScore, checks };
  }

  private getConnection(): Connection {
    const rpc = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
    return new Connection(rpc, { commitment: 'confirmed', wsEndpoint: undefined as any });
  }

  private getNotabeneProgramId(): PublicKey {
    const id = process.env.MOCK_NOTABENE_PROGRAM_ID || 'FZ5EaUHqohNGBdsvjr4LYnK181xoBWNhZiUg1iTaf9f7';
    return new PublicKey(id);
  }

  private getMeshProgramId(): PublicKey {
    const id = process.env.MOCK_MESH_PROGRAM_ID || '3ptgmaf1dWrn8WsmRsat641srbbY1vfBvhMwVwczpoU2';
    return new PublicKey(id);
  }

  private getJurisdictionEngineProgramId(): PublicKey {
    const id = process.env.MOCK_JURISDICTION_ENGINE_PROGRAM_ID || 'HhPHx1RgzA99brCGprSg5VwJ8ZRgeXkLADbDRUox3Cq6';
    return new PublicKey(id);
  }

  /**
   * Compute Anchor account discriminator: sha256("account:<AccountTypeName>")[0..8]
   */
  private getAccountDiscriminator(accountType: string): Buffer {
    const hash = createHash('sha256')
      .update(`account:${accountType}`)
      .digest();
    return hash.subarray(0, 8);
  }

  // ─── Notabene (Travel Rule) ───────────────────────────────────

  /**
   * Get a single TravelRuleCheck by checkId.
   * Derives PDA from ["travel_rule", checkId] on notabene program.
   */
  async getTravelRuleCheck(checkId: string): Promise<any | null> {
    try {
      const connection = this.getConnection();
      const programId = this.getNotabeneProgramId();

      const [pda] = PublicKey.findProgramAddressSync(
        [Buffer.from('travel_rule'), Buffer.from(checkId)],
        programId,
      );

      this.logger.log(`getTravelRuleCheck: checkId=${checkId}, PDA=${pda.toBase58()}`);

      const accountInfo = await connection.getAccountInfo(pda);
      if (!accountInfo) {
        this.logger.warn(`TravelRuleCheck not found: ${checkId}`);
        return null;
      }

      return this.deserializeTravelRuleCheck(accountInfo.data);
    } catch (error: any) {
      this.logger.error(`Failed to fetch TravelRuleCheck ${checkId}: ${error.message}`);
      return null;
    }
  }

  /**
   * Get all TravelRuleCheck accounts using getProgramAccounts with discriminator filter.
   * NOTE: This returns ALL checks, not filtered by vaultId (no vault_id field in the account).
   * Frontend/caller must filter by relevant criteria.
   */
  async getTravelRuleChecksForVault(vaultId: string): Promise<any[]> {
    try {
      const connection = this.getConnection();
      const programId = this.getNotabeneProgramId();
      const discriminator = this.getAccountDiscriminator('TravelRuleCheck');

      this.logger.log(`getTravelRuleChecksForVault: vaultId=${vaultId}, scanning all TravelRuleCheck accounts`);

      const accounts = await connection.getProgramAccounts(programId, {
        filters: [
          {
            memcmp: {
              offset: 0,
              bytes: bs58.encode(discriminator),
            },
          },
        ],
      });

      this.logger.log(`Found ${accounts.length} TravelRuleCheck account(s)`);

      const results = accounts
        .map(({ pubkey, account }) => {
          try {
            const data = this.deserializeTravelRuleCheck(account.data);
            return { ...data, pda: pubkey.toBase58() };
          } catch (e: any) {
            this.logger.error(`Failed to deserialize TravelRuleCheck at ${pubkey.toBase58()}: ${e.message}`);
            return null;
          }
        })
        .filter(Boolean);

      return results;
    } catch (error: any) {
      this.logger.error(`Failed to fetch TravelRuleChecks: ${error.message}`);
      return [];
    }
  }

  /**
   * Get all VASP entries from notabene program.
   */
  async getVASPs(): Promise<any[]> {
    try {
      const connection = this.getConnection();
      const programId = this.getNotabeneProgramId();
      const discriminator = this.getAccountDiscriminator('VASPEntry');

      this.logger.log(`getVASPs: scanning VASPEntry accounts`);

      const accounts = await connection.getProgramAccounts(programId, {
        filters: [
          {
            memcmp: {
              offset: 0,
              bytes: bs58.encode(discriminator),
            },
          },
        ],
      });

      this.logger.log(`Found ${accounts.length} VASPEntry account(s)`);

      const results = accounts
        .map(({ pubkey, account }) => {
          try {
            const data = this.deserializeVASPEntry(account.data);
            return { ...data, pda: pubkey.toBase58() };
          } catch (e: any) {
            this.logger.error(`Failed to deserialize VASPEntry at ${pubkey.toBase58()}: ${e.message}`);
            return null;
          }
        })
        .filter(Boolean);

      return results;
    } catch (error: any) {
      this.logger.error(`Failed to fetch VASPs: ${error.message}`);
      return [];
    }
  }

  private deserializeTravelRuleCheck(data: Buffer): any {
    const reader = new BorshReader(data);
    reader.skip(8); // skip discriminator

    const checkId = reader.readString();
    const originatorVasp = reader.readString();
    const beneficiaryVasp = reader.readString();
    const originatorWallet = reader.readPubkey();
    const beneficiaryWallet = reader.readPubkey();
    const amount = reader.readU64();
    const currency = reader.readString();
    const originatorJurisdiction = reader.readString();
    const beneficiaryJurisdiction = reader.readString();
    const thresholdApplied = reader.readU64();
    const statusU8 = reader.readU8();
    const checkedAt = reader.readI64();

    const statusMap = ['Exempt', 'Compliant', 'PendingReview', 'Blocked'];
    const status = statusMap[statusU8] || 'Unknown';

    return {
      checkId,
      originatorVasp,
      beneficiaryVasp,
      originatorWallet,
      beneficiaryWallet,
      amount: amount.toString(),
      currency,
      originatorJurisdiction,
      beneficiaryJurisdiction,
      thresholdApplied: thresholdApplied.toString(),
      status,
      checkedAt: checkedAt.toString(),
    };
  }

  private deserializeVASPEntry(data: Buffer): any {
    const reader = new BorshReader(data);
    reader.skip(8); // skip discriminator

    const vaspId = reader.readString();
    const name = reader.readString();
    const jurisdiction = reader.readString();
    const lei = reader.readString();
    const statusU8 = reader.readU8();
    const registeredAt = reader.readI64();

    const statusMap = ['Active', 'Suspended'];
    const status = statusMap[statusU8] || 'Unknown';

    return {
      vaspId,
      name,
      jurisdiction,
      lei,
      status,
      registeredAt: registeredAt.toString(),
    };
  }

  // ─── Mesh (Venue Routing) ─────────────────────────────────────

  /**
   * Get all venue entries from mesh program.
   */
  async getVenues(): Promise<any[]> {
    try {
      const connection = this.getConnection();
      const programId = this.getMeshProgramId();
      const discriminator = this.getAccountDiscriminator('VenueEntry');

      this.logger.log(`getVenues: scanning VenueEntry accounts`);

      const accounts = await connection.getProgramAccounts(programId, {
        filters: [
          {
            memcmp: {
              offset: 0,
              bytes: bs58.encode(discriminator),
            },
          },
        ],
      });

      this.logger.log(`Found ${accounts.length} VenueEntry account(s)`);

      const results = accounts
        .map(({ pubkey, account }) => {
          try {
            const data = this.deserializeVenueEntry(account.data);
            return { ...data, pda: pubkey.toBase58() };
          } catch (e: any) {
            this.logger.error(`Failed to deserialize VenueEntry at ${pubkey.toBase58()}: ${e.message}`);
            return null;
          }
        })
        .filter(Boolean);

      return results;
    } catch (error: any) {
      this.logger.error(`Failed to fetch Venues: ${error.message}`);
      return [];
    }
  }

  /**
   * Get routing decisions for a specific vault.
   * Uses getProgramAccounts with discriminator filter, then filters in-memory by vault_id.
   */
  async getRoutingDecisionsForVault(vaultId: string): Promise<any[]> {
    try {
      const connection = this.getConnection();
      const programId = this.getMeshProgramId();
      const discriminator = this.getAccountDiscriminator('RoutingDecision');

      this.logger.log(`getRoutingDecisionsForVault: vaultId=${vaultId}, scanning RoutingDecision accounts`);

      const accounts = await connection.getProgramAccounts(programId, {
        filters: [
          {
            memcmp: {
              offset: 0,
              bytes: bs58.encode(discriminator),
            },
          },
        ],
      });

      this.logger.log(`Found ${accounts.length} RoutingDecision account(s)`);

      const results = accounts
        .map(({ pubkey, account }) => {
          try {
            const data = this.deserializeRoutingDecision(account.data);
            return { ...data, pda: pubkey.toBase58() };
          } catch (e: any) {
            this.logger.error(`Failed to deserialize RoutingDecision at ${pubkey.toBase58()}: ${e.message}`);
            return null;
          }
        })
        .filter(Boolean)
        .filter((decision: any) => decision.vaultId === vaultId);

      this.logger.log(`Filtered to ${results.length} RoutingDecision(s) for vault ${vaultId}`);

      return results;
    } catch (error: any) {
      this.logger.error(`Failed to fetch RoutingDecisions for vault ${vaultId}: ${error.message}`);
      return [];
    }
  }

  private deserializeVenueEntry(data: Buffer): any {
    const reader = new BorshReader(data);
    reader.skip(8); // skip discriminator

    const venueId = reader.readString();
    const name = reader.readString();
    const venueTypeU8 = reader.readU8();
    const riskTier = reader.readString();
    const supportedAssets = reader.readVecString();
    const statusU8 = reader.readU8();
    const registeredAt = reader.readI64();

    const venueTypeMap = ['YieldVault', 'Exchange', 'LendingPool', 'StakingProvider'];
    const venueType = venueTypeMap[venueTypeU8] || 'Unknown';

    const statusMap = ['Active', 'Suspended', 'Maintenance'];
    const status = statusMap[statusU8] || 'Unknown';

    return {
      venueId,
      name,
      venueType,
      riskTier,
      supportedAssets,
      status,
      registeredAt: registeredAt.toString(),
    };
  }

  private deserializeRoutingDecision(data: Buffer): any {
    const reader = new BorshReader(data);
    reader.skip(8); // skip discriminator

    const routingId = reader.readString();
    const vaultId = reader.readString();
    const strategyId = reader.readString();
    const venueId = reader.readString();
    const amount = reader.readU64();
    const eligible = reader.readBool();
    const routingReason = reader.readString();
    const sourceTx = reader.readString();
    const routedAt = reader.readI64();

    return {
      routingId,
      vaultId,
      strategyId,
      venueId,
      amount: amount.toString(),
      eligible,
      routingReason,
      sourceTx,
      routedAt: routedAt.toString(),
    };
  }

  // ─── Jurisdiction Engine ──────────────────────────────────────

  /**
   * Get all jurisdiction rules from jurisdiction-engine program.
   */
  async getJurisdictions(): Promise<any[]> {
    try {
      const connection = this.getConnection();
      const programId = this.getJurisdictionEngineProgramId();
      const discriminator = this.getAccountDiscriminator('JurisdictionRules');

      this.logger.log(`getJurisdictions: scanning JurisdictionRules accounts`);

      const accounts = await connection.getProgramAccounts(programId, {
        filters: [
          {
            memcmp: {
              offset: 0,
              bytes: bs58.encode(discriminator),
            },
          },
        ],
      });

      this.logger.log(`Found ${accounts.length} JurisdictionRules account(s)`);

      const results = accounts
        .map(({ pubkey, account }) => {
          try {
            const data = this.deserializeJurisdictionRules(account.data);
            return { ...data, pda: pubkey.toBase58() };
          } catch (e: any) {
            this.logger.error(`Failed to deserialize JurisdictionRules at ${pubkey.toBase58()}: ${e.message}`);
            return null;
          }
        })
        .filter(Boolean);

      return results;
    } catch (error: any) {
      this.logger.error(`Failed to fetch Jurisdictions: ${error.message}`);
      return [];
    }
  }

  /**
   * Get a single jurisdiction by code.
   * Derives PDA from ["jurisdiction", code] on jurisdiction-engine program.
   */
  async getJurisdiction(code: string): Promise<any | null> {
    try {
      const connection = this.getConnection();
      const programId = this.getJurisdictionEngineProgramId();

      const [pda] = PublicKey.findProgramAddressSync(
        [Buffer.from('jurisdiction'), Buffer.from(code)],
        programId,
      );

      this.logger.log(`getJurisdiction: code=${code}, PDA=${pda.toBase58()}`);

      const accountInfo = await connection.getAccountInfo(pda);
      if (!accountInfo) {
        this.logger.warn(`Jurisdiction not found: ${code}`);
        return null;
      }

      return this.deserializeJurisdictionRules(accountInfo.data);
    } catch (error: any) {
      this.logger.error(`Failed to fetch Jurisdiction ${code}: ${error.message}`);
      return null;
    }
  }

  /**
   * Get compliance attestations for a specific vault.
   * Uses getProgramAccounts with discriminator filter, then filters in-memory by vault_id.
   */
  async getComplianceAttestationsForVault(vaultId: string): Promise<any[]> {
    try {
      const connection = this.getConnection();
      const programId = this.getJurisdictionEngineProgramId();
      const discriminator = this.getAccountDiscriminator('ComplianceAttestation');

      this.logger.log(`getComplianceAttestationsForVault: vaultId=${vaultId}, scanning ComplianceAttestation accounts`);

      const accounts = await connection.getProgramAccounts(programId, {
        filters: [
          {
            memcmp: {
              offset: 0,
              bytes: bs58.encode(discriminator),
            },
          },
        ],
      });

      this.logger.log(`Found ${accounts.length} ComplianceAttestation account(s)`);

      const results = accounts
        .map(({ pubkey, account }) => {
          try {
            const data = this.deserializeComplianceAttestation(account.data);
            return { ...data, pda: pubkey.toBase58() };
          } catch (e: any) {
            this.logger.error(`Failed to deserialize ComplianceAttestation at ${pubkey.toBase58()}: ${e.message}`);
            return null;
          }
        })
        .filter(Boolean)
        .filter((attestation: any) => attestation.vaultId === vaultId);

      this.logger.log(`Filtered to ${results.length} ComplianceAttestation(s) for vault ${vaultId}`);

      return results;
    } catch (error: any) {
      this.logger.error(`Failed to fetch ComplianceAttestations for vault ${vaultId}: ${error.message}`);
      return [];
    }
  }

  private deserializeJurisdictionRules(data: Buffer): any {
    const reader = new BorshReader(data);
    reader.skip(8); // skip discriminator

    const code = reader.readString();
    const regulatorName = reader.readString();
    const licenseName = reader.readString();
    const travelRuleThreshold = reader.readU64();
    const consentRequiredAbove = reader.readU64();
    const reportingCurrency = reader.readString();
    const maxLeverageAllowed = reader.readBool();
    const amlScreeningRequired = reader.readBool();
    const active = reader.readBool();

    return {
      code,
      regulatorName,
      licenseName,
      travelRuleThreshold: travelRuleThreshold.toString(),
      consentRequiredAbove: consentRequiredAbove.toString(),
      reportingCurrency,
      maxLeverageAllowed,
      amlScreeningRequired,
      active,
    };
  }

  private deserializeComplianceAttestation(data: Buffer): any {
    const reader = new BorshReader(data);
    reader.skip(8); // skip discriminator

    const attestationId = reader.readString();
    const vaultId = reader.readString();
    const jurisdiction = reader.readString();
    const operationType = reader.readString();
    const amount = reader.readU64();
    const rulesApplied = reader.readString();
    const travelRuleStatus = reader.readString();
    const resultU8 = reader.readU8();
    const attestedAt = reader.readI64();

    const resultMap = ['Passed', 'Failed', 'ReviewRequired'];
    const result = resultMap[resultU8] || 'Unknown';

    return {
      attestationId,
      vaultId,
      jurisdiction,
      operationType,
      amount: amount.toString(),
      rulesApplied,
      travelRuleStatus,
      result,
      attestedAt: attestedAt.toString(),
    };
  }
}
