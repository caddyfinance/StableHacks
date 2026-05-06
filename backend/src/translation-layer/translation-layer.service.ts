import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import bs58 from 'bs58';

/**
 * Service to interact with the mock-translation-layer Anchor program.
 * Submits instructions and reads InstructionLog PDAs for the AMINA compliance pipeline.
 */
@Injectable()
export class TranslationLayerService {
  private readonly logger = new Logger(TranslationLayerService.name);

  // Program IDs for CPI account passing
  private readonly MOCK_FINSTAR_PROGRAM_ID = new PublicKey('7jH9Lhe9Ny3a8LxUsS3BCSHoDKmQZz5Vpu1py4pemisF');
  private readonly MOCK_NOTABENE_PROGRAM_ID = new PublicKey('FZ5EaUHqohNGBdsvjr4LYnK181xoBWNhZiUg1iTaf9f7');
  private readonly MOCK_MESH_PROGRAM_ID = new PublicKey('3ptgmaf1dWrn8WsmRsat641srbbY1vfBvhMwVwczpoU2');
  private readonly MOCK_JURISDICTION_ENGINE_PROGRAM_ID = new PublicKey('HhPHx1RgzA99brCGprSg5VwJ8ZRgeXkLADbDRUox3Cq6');

  private getProgramPublicKey(): PublicKey {
    const id = process.env.MOCK_TRANSLATION_LAYER_PROGRAM_ID || 'EokhQnmdSswBvj8VfnV5TBKVantJNqGHWv243L8e6sDv';
    return new PublicKey(id);
  }

  private getSigningAuthority(): Keypair {
    const key = process.env.SAS_ISSUER_KEYPAIR;
    if (!key) throw new Error('SAS_ISSUER_KEYPAIR not set in .env');
    return Keypair.fromSecretKey(bs58.decode(key));
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
   * Borsh-serialize a string: 4-byte LE length prefix + UTF-8 bytes
   */
  private serializeString(value: string): Buffer {
    const bytes = Buffer.from(value, 'utf8');
    const len = Buffer.alloc(4);
    len.writeUInt32LE(bytes.length, 0);
    return Buffer.concat([len, bytes]);
  }

  /**
   * Borsh-serialize a u64 value as 8-byte LE
   */
  private serializeU64(value: number): Buffer {
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64LE(BigInt(value), 0);
    return buf;
  }

  /**
   * Borsh-serialize a u8 value
   */
  private serializeU8(value: number): Buffer {
    return Buffer.from([value]);
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

  /**
   * Derive TL Config PDA: seeds = ["tl_config"]
   */
  private deriveTlConfigPda(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('tl_config')],
      this.getProgramPublicKey(),
    );
  }

  /**
   * Derive InstructionLog PDA: seeds = ["instruction", instruction_id.as_bytes()]
   */
  private deriveInstructionLogPda(instructionId: string): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('instruction'), Buffer.from(instructionId)],
      this.getProgramPublicKey(),
    );
  }

  /**
   * Derive ComplianceAttestation PDA: seeds = ["compliance", attestation_id.as_bytes()]
   * Matches mock-jurisdiction-engine contract: EvaluateCompliance context
   */
  private deriveComplianceAttestationPda(_instructionLogPda: PublicKey, attestationId: string): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('compliance'), Buffer.from(attestationId)],
      this.MOCK_JURISDICTION_ENGINE_PROGRAM_ID,
    );
  }

  /**
   * Derive TravelRuleCheck PDA: seeds = ["travel_rule", check_id.as_bytes()]
   * Matches mock-notabene contract: EvaluateTransfer context
   */
  private deriveTravelRuleCheckPda(_instructionLogPda: PublicKey, checkId: string): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('travel_rule'), Buffer.from(checkId)],
      this.MOCK_NOTABENE_PROGRAM_ID,
    );
  }

  /**
   * Derive JurisdictionRules PDA: seeds = ["jurisdiction", jurisdiction.as_bytes()]
   * Matches mock-jurisdiction-engine contract: RegisterJurisdiction context
   */
  private deriveJurisdictionRulesPda(jurisdiction: string): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('jurisdiction'), Buffer.from(jurisdiction)],
      this.MOCK_JURISDICTION_ENGINE_PROGRAM_ID,
    );
  }

  /**
   * Derive NotabeneConfig PDA: seeds = ["notabene_config"]
   * Matches mock-notabene contract: Initialize context
   */
  private deriveNotabeneConfigPda(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('notabene_config')],
      this.MOCK_NOTABENE_PROGRAM_ID,
    );
  }

  /**
   * Derive RoutingDecision PDA: seeds = ["routing", routing_id.as_bytes()]
   * Matches mock-mesh contract: RecordRouting context
   */
  private deriveRoutingDecisionPda(_instructionLogPda: PublicKey, routingId: string): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('routing'), Buffer.from(routingId)],
      this.MOCK_MESH_PROGRAM_ID,
    );
  }

  /**
   * Derive MeshConfig PDA: seeds = ["mesh_config"]
   * Matches mock-mesh contract: Initialize context
   */
  private deriveMeshConfigPda(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('mesh_config')],
      this.MOCK_MESH_PROGRAM_ID,
    );
  }

  /**
   * Derive GLEntry PDA: seeds = ["gl_entry", gl_entry_id.as_bytes()]
   * Matches mock-finstar contract: RecordBookBack context
   */
  private deriveGLEntryPda(_instructionLogPda: PublicKey, glEntryId: string): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('gl_entry'), Buffer.from(glEntryId)],
      this.MOCK_FINSTAR_PROGRAM_ID,
    );
  }

  /**
   * Derive FinstarConfig PDA: seeds = ["finstar_config"]
   * Matches mock-finstar contract: Initialize context
   */
  private deriveFinstarConfigPda(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('finstar_config')],
      this.MOCK_FINSTAR_PROGRAM_ID,
    );
  }

  /**
   * Deserialize a string from Borsh format
   */
  private deserializeString(buffer: Buffer, offset: number): { value: string; newOffset: number } {
    const len = buffer.readUInt32LE(offset);
    const value = buffer.subarray(offset + 4, offset + 4 + len).toString('utf8');
    return { value, newOffset: offset + 4 + len };
  }

  /**
   * Deserialize InstructionLog PDA account data (after 8-byte discriminator)
   */
  private deserializeInstructionLog(data: Buffer): any {
    let offset = 8; // Skip discriminator

    const { value: instruction_id, newOffset: o1 } = this.deserializeString(data, offset);
    const instruction_type = data[o1];
    const { value: vault_id, newOffset: o2 } = this.deserializeString(data, o1 + 1);
    const initiator = new PublicKey(data.subarray(o2, o2 + 32));
    const amount = data.readBigUInt64LE(o2 + 32);
    const { value: jurisdiction, newOffset: o3 } = this.deserializeString(data, o2 + 40);
    const { value: strategy_id, newOffset: o4 } = this.deserializeString(data, o3);
    const compliance_check_pda = new PublicKey(data.subarray(o4, o4 + 32));
    const travel_rule_check_pda = new PublicKey(data.subarray(o4 + 32, o4 + 64));
    const routing_decision_pda = new PublicKey(data.subarray(o4 + 64, o4 + 96));
    const { value: vault_tx_signature, newOffset: o5 } = this.deserializeString(data, o4 + 96);
    const gl_entry_pda = new PublicKey(data.subarray(o5, o5 + 32));
    const status = data[o5 + 32];
    const { value: rejection_reason, newOffset: o6 } = this.deserializeString(data, o5 + 33);
    const received_at = data.readBigInt64LE(o6);
    const completed_at = data.readBigInt64LE(o6 + 8);

    return {
      instruction_id,
      instruction_type,
      vault_id,
      initiator: initiator.toBase58(),
      amount: amount.toString(),
      jurisdiction,
      strategy_id,
      compliance_check_pda: compliance_check_pda.toBase58(),
      travel_rule_check_pda: travel_rule_check_pda.toBase58(),
      routing_decision_pda: routing_decision_pda.toBase58(),
      vault_tx_signature,
      gl_entry_pda: gl_entry_pda.toBase58(),
      status,
      rejection_reason,
      received_at: received_at.toString(),
      completed_at: completed_at.toString(),
    };
  }

  /**
   * Submit an instruction to the translation layer.
   * Instruction types: Deposit=0, Allocate=1, Redeem=2, Unwind=3, Pause=4, MandateUpdate=5
   */
  async submitInstruction(
    instructionType: string,
    vaultId: string,
    amount: number,
    jurisdiction: string,
    strategyId: string,
  ): Promise<{ instructionId: string; pda: string; txSignature: string }> {
    const connection = this.getConnection();
    const authority = this.getSigningAuthority();
    const programId = this.getProgramPublicKey();

    // Map instruction type to enum
    const typeMap: Record<string, number> = {
      Deposit: 0,
      Allocate: 1,
      Redeem: 2,
      Unwind: 3,
      Pause: 4,
      MandateUpdate: 5,
    };
    const typeValue = typeMap[instructionType];
    if (typeValue === undefined) {
      throw new Error(`Invalid instruction type: ${instructionType}`);
    }

    // Generate instruction ID
    const instructionId = `TL-${Date.now().toString(36).toUpperCase()}`;

    const [instructionLogPda] = this.deriveInstructionLogPda(instructionId);
    const [tlConfigPda] = this.deriveTlConfigPda();

    this.logger.log(
      `submitInstruction: id=${instructionId}, type=${instructionType}, vault=${vaultId}, amount=${amount}, jurisdiction=${jurisdiction}, strategy=${strategyId}`,
    );

    // Build instruction data: discriminator + (instruction_id, instruction_type, vault_id, amount, jurisdiction, strategy_id)
    const discriminator = this.getDiscriminator('submit_instruction');
    const instructionData = Buffer.concat([
      discriminator,
      this.serializeString(instructionId),
      this.serializeU8(typeValue),
      this.serializeString(vaultId),
      this.serializeU64(amount),
      this.serializeString(jurisdiction),
      this.serializeString(strategyId),
    ]);

    const instruction = new TransactionInstruction({
      programId,
      keys: [
        { pubkey: instructionLogPda, isSigner: false, isWritable: true }, // instruction_log (init)
        { pubkey: tlConfigPda, isSigner: false, isWritable: true },       // tl_config (mut — increments total_instructions)
        { pubkey: authority.publicKey, isSigner: true, isWritable: true }, // initiator (signer, payer)
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

    this.logger.log(`Instruction submitted: id=${instructionId}, pda=${instructionLogPda.toBase58()}, tx=${txSignature}`);

    return {
      instructionId,
      pda: instructionLogPda.toBase58(),
      txSignature,
    };
  }

  /**
   * Execute compliance checks for an instruction.
   */
  async executeCompliance(
    instructionId: string,
    jurisdiction: string,
  ): Promise<{ compliancePda: string; travelRulePda: string; txSignature: string }> {
    const connection = this.getConnection();
    const authority = this.getSigningAuthority();
    const programId = this.getProgramPublicKey();

    const [instructionLogPda] = this.deriveInstructionLogPda(instructionId);
    const attestationId = `CA-${instructionId}`;
    const checkId = `TR-${instructionId}`;

    const [complianceAttestationPda] = this.deriveComplianceAttestationPda(instructionLogPda, attestationId);
    const [travelRuleCheckPda] = this.deriveTravelRuleCheckPda(instructionLogPda, checkId);
    const [jurisdictionRulesPda] = this.deriveJurisdictionRulesPda(jurisdiction);
    const [notabeneConfigPda] = this.deriveNotabeneConfigPda();

    this.logger.log(`executeCompliance: instructionId=${instructionId}, jurisdiction=${jurisdiction}`);

    // Build instruction data: discriminator + (attestation_id, check_id, jurisdiction)
    const discriminator = this.getDiscriminator('execute_compliance');
    const instructionData = Buffer.concat([
      discriminator,
      this.serializeString(attestationId),
      this.serializeString(checkId),
      this.serializeString(jurisdiction),
    ]);

    const instruction = new TransactionInstruction({
      programId,
      keys: [
        { pubkey: instructionLogPda, isSigner: false, isWritable: true },            // instruction_log (mut)
        { pubkey: complianceAttestationPda, isSigner: false, isWritable: true },     // compliance_attestation (init by CPI)
        { pubkey: jurisdictionRulesPda, isSigner: false, isWritable: false },       // jurisdiction_rules
        { pubkey: this.MOCK_JURISDICTION_ENGINE_PROGRAM_ID, isSigner: false, isWritable: false }, // jurisdiction_program
        { pubkey: travelRuleCheckPda, isSigner: false, isWritable: true },          // travel_rule_check (init by CPI)
        { pubkey: notabeneConfigPda, isSigner: false, isWritable: true },           // notabene_config (mut — increments total_checks)
        { pubkey: this.MOCK_NOTABENE_PROGRAM_ID, isSigner: false, isWritable: false }, // notabene_program
        { pubkey: authority.publicKey, isSigner: true, isWritable: true },          // authority (signer, payer)
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },    // system_program
      ],
      data: instructionData,
    });

    const transaction = new Transaction().add(instruction);
    transaction.feePayer = authority.publicKey;
    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    transaction.recentBlockhash = blockhash;
    transaction.sign(authority);

    const txSignature = await this.sendAndConfirm(connection, transaction);

    this.logger.log(
      `Compliance executed: instructionId=${instructionId}, compliancePda=${complianceAttestationPda.toBase58()}, travelRulePda=${travelRuleCheckPda.toBase58()}, tx=${txSignature}`,
    );

    return {
      compliancePda: complianceAttestationPda.toBase58(),
      travelRulePda: travelRuleCheckPda.toBase58(),
      txSignature,
    };
  }

  /**
   * Execute action (routing + GL entry) for an instruction.
   */
  async executeAction(instructionId: string): Promise<{ routingPda: string; glEntryPda: string; txSignature: string }> {
    const connection = this.getConnection();
    const authority = this.getSigningAuthority();
    const programId = this.getProgramPublicKey();

    const [instructionLogPda] = this.deriveInstructionLogPda(instructionId);
    const routingId = `RT-${instructionId}`;
    const glEntryId = `GL-${instructionId}`;

    const [routingDecisionPda] = this.deriveRoutingDecisionPda(instructionLogPda, routingId);
    const [meshConfigPda] = this.deriveMeshConfigPda();
    const [glEntryPda] = this.deriveGLEntryPda(instructionLogPda, glEntryId);
    const [finstarConfigPda] = this.deriveFinstarConfigPda();

    this.logger.log(`executeAction: instructionId=${instructionId}`);

    // Build instruction data: discriminator + (routing_id, gl_entry_id)
    const discriminator = this.getDiscriminator('execute_action');
    const instructionData = Buffer.concat([
      discriminator,
      this.serializeString(routingId),
      this.serializeString(glEntryId),
    ]);

    const instruction = new TransactionInstruction({
      programId,
      keys: [
        { pubkey: instructionLogPda, isSigner: false, isWritable: true },        // instruction_log (mut)
        { pubkey: routingDecisionPda, isSigner: false, isWritable: true },       // routing_decision (init by CPI)
        { pubkey: meshConfigPda, isSigner: false, isWritable: true },            // mesh_config (mut — increments total_routings)
        { pubkey: this.MOCK_MESH_PROGRAM_ID, isSigner: false, isWritable: false }, // mesh_program
        { pubkey: glEntryPda, isSigner: false, isWritable: true },               // gl_entry (init by CPI)
        { pubkey: finstarConfigPda, isSigner: false, isWritable: true },         // finstar_config (mut — increments total_entries)
        { pubkey: this.MOCK_FINSTAR_PROGRAM_ID, isSigner: false, isWritable: false }, // finstar_program
        { pubkey: authority.publicKey, isSigner: true, isWritable: true },       // authority (signer, payer)
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

    this.logger.log(
      `Action executed: instructionId=${instructionId}, routingPda=${routingDecisionPda.toBase58()}, glEntryPda=${glEntryPda.toBase58()}, tx=${txSignature}`,
    );

    return {
      routingPda: routingDecisionPda.toBase58(),
      glEntryPda: glEntryPda.toBase58(),
      txSignature,
    };
  }

  /**
   * Get pipeline status by reading InstructionLog PDA.
   */
  async getPipelineStatus(instructionId: string): Promise<any> {
    const connection = this.getConnection();
    const [instructionLogPda] = this.deriveInstructionLogPda(instructionId);

    this.logger.log(`getPipelineStatus: instructionId=${instructionId}, pda=${instructionLogPda.toBase58()}`);

    const accountInfo = await connection.getAccountInfo(instructionLogPda);
    if (!accountInfo) {
      throw new Error(`InstructionLog not found for instructionId: ${instructionId}`);
    }

    const instructionLog = this.deserializeInstructionLog(accountInfo.data);

    this.logger.log(`Pipeline status: instructionId=${instructionId}, status=${instructionLog.status}`);

    return instructionLog;
  }

  /**
   * Get instruction history for a vault by scanning getProgramAccounts with memcmp on vault_id.
   */
  async getInstructionHistory(vaultId: string): Promise<any[]> {
    const connection = this.getConnection();
    const programId = this.getProgramPublicKey();

    this.logger.log(`getInstructionHistory: vaultId=${vaultId}`);

    // The vault_id field is at offset 8 (discriminator) + 4+instruction_id.len + 1 (instruction_type)
    // We can't predict the exact offset, so we'll fetch all InstructionLog accounts and filter in-memory
    // For proper implementation, you'd compute the offset based on average instruction_id length or scan all

    // Fetch all accounts owned by the program with "instruction" seed discriminator
    // This is simplified; in production you'd want proper memcmp filtering
    const accounts = await connection.getProgramAccounts(programId, {
      filters: [
        {
          memcmp: {
            offset: 0,
            bytes: bs58.encode(this.getDiscriminator('instruction_log_account')), // Placeholder
          },
        },
      ],
    });

    const history: any[] = [];

    for (const { pubkey, account } of accounts) {
      try {
        const instructionLog = this.deserializeInstructionLog(account.data);
        if (instructionLog.vault_id === vaultId) {
          history.push({
            pubkey: pubkey.toBase58(),
            ...instructionLog,
          });
        }
      } catch (error) {
        // Skip accounts that don't match the expected structure
        continue;
      }
    }

    this.logger.log(`Found ${history.length} instructions for vault ${vaultId}`);

    return history;
  }

  /**
   * Get TranslationLayerConfig PDA data.
   */
  async getConfig(): Promise<any> {
    const connection = this.getConnection();
    const [tlConfigPda] = this.deriveTlConfigPda();

    this.logger.log(`getConfig: pda=${tlConfigPda.toBase58()}`);

    const accountInfo = await connection.getAccountInfo(tlConfigPda);
    if (!accountInfo) {
      throw new Error('TranslationLayerConfig not found');
    }

    // Deserialize config (simplified - add proper deserialization based on your schema)
    // For now, return raw data
    this.logger.log(`Config found: ${accountInfo.data.length} bytes`);

    return {
      pda: tlConfigPda.toBase58(),
      dataLength: accountInfo.data.length,
      // Add proper deserialization here based on your config structure
    };
  }
}
