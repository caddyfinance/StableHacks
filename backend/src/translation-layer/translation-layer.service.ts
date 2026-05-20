import { Injectable, Logger, Inject, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';

const VALID_STATUSES = ['received', 'compliance_checked', 'complete', 'failed'] as const;
const TYPE_MAP: Record<string, string> = {
  deposit: 'DEPOSIT',
  allocate: 'ALLOCATE',
  redeem: 'REDEEM',
  unwind: 'UNWIND',
  pause: 'PAUSE',
  mandateupdate: 'MANDATE_UPDATE',
};

const GL_ENTRY_MAP: Record<string, string> = {
  DEPOSIT: 'Deposit',
  ALLOCATE: 'StrategyAllocation',
  REDEEM: 'Withdrawal',
  UNWIND: 'StrategyUnwind',
  PAUSE: 'OperationalFlag',
  MANDATE_UPDATE: 'ConfigurationRecord',
};

const GL_DIRECTION_MAP: Record<string, string> = {
  DEPOSIT: 'credit',
  ALLOCATE: 'debit',
  REDEEM: 'debit',
  UNWIND: 'credit',
  PAUSE: 'neutral',
  MANDATE_UPDATE: 'neutral',
};

const GL_ACCOUNTS: Record<string, { debitAccount: string; creditAccount: string }> = {
  DEPOSIT: { debitAccount: 'CLIENT-CUSTODY', creditAccount: 'VAULT' },
  ALLOCATE: { debitAccount: 'VAULT', creditAccount: 'STRATEGY' },
  REDEEM: { debitAccount: 'VAULT', creditAccount: 'CLIENT-CUSTODY' },
  UNWIND: { debitAccount: 'STRATEGY', creditAccount: 'VAULT' },
  PAUSE: { debitAccount: 'OPERATIONAL', creditAccount: 'OPERATIONAL' },
  MANDATE_UPDATE: { debitAccount: 'CONFIGURATION', creditAccount: 'CONFIGURATION' },
};

@Injectable()
export class TranslationLayerService {
  private readonly logger = new Logger(TranslationLayerService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EventsService) private readonly events: EventsService,
  ) {}

  async submitInstruction(
    instructionType: string,
    vaultId: string,
    amount: number,
    jurisdiction: string,
    strategyId?: string,
    initiator?: string,
  ): Promise<{ instructionId: string; dbRef: string }> {
    const normalizedType = TYPE_MAP[instructionType.toLowerCase()] || instructionType.toUpperCase();

    const vault = await this.prisma.vault.findUnique({ where: { vaultId } });
    if (!vault) throw new NotFoundException(`Vault not found: ${vaultId}`);

    const instructionId = `TL-${Date.now().toString(36).toUpperCase()}`;
    const glEntryType = GL_ENTRY_MAP[normalizedType] || normalizedType;
    const glDirection = GL_DIRECTION_MAP[normalizedType] || 'neutral';

    const instruction = await this.prisma.translationLayerInstruction.create({
      data: {
        instructionId,
        instructionType: normalizedType,
        vaultId,
        amount: amount || 0,
        jurisdiction,
        strategyId: strategyId || null,
        status: 'received',
        glEntryType,
        glDirection,
        initiator: initiator || null,
        receivedAt: new Date(),
      },
    });

    await this.events.emit({
      vaultId,
      actionType: 'TL_INSTRUCTION_SUBMITTED',
      actor: initiator || 'system',
      role: 'Translation Layer',
      result: 'success',
      reason: `${normalizedType} instruction submitted for vault ${vaultId}, amount ${amount}`,
      amount,
      asset: vault.baseAsset,
    });

    this.logger.log(`submitInstruction: id=${instructionId}, type=${normalizedType}, vault=${vaultId}`);

    return { instructionId, dbRef: instruction.id };
  }

  async executeCompliance(
    instructionId: string,
    jurisdiction: string,
  ): Promise<{ complianceRef: string; travelRuleRef: string; complianceResult: string }> {
    const instruction = await this.prisma.translationLayerInstruction.findUnique({
      where: { instructionId },
    });
    if (!instruction) throw new NotFoundException(`Instruction not found: ${instructionId}`);

    if (instruction.status !== 'received') {
      throw new BadRequestException(
        `Instruction ${instructionId} is in status '${instruction.status}', expected 'received'. Compliance check already performed or instruction not ready.`,
      );
    }

    const vault = await this.prisma.vault.findUnique({
      where: { vaultId: instruction.vaultId },
      select: { clientReference: true, baseAsset: true, vaultId: true },
    });

    const complianceRef = `CA-${instructionId}`;
    const travelRuleRef = `TR-${instructionId}`;
    const screeningStatus = await this.resolveScreeningStatus(instruction);
    const complianceResult = screeningStatus === 'Clear' ? 'passed' : 'failed';

    await this.prisma.translationLayerInstruction.update({
      where: { instructionId },
      data: {
        status: complianceResult === 'passed' ? 'compliance_checked' : 'failed',
        complianceRef,
        travelRuleRef,
        complianceResult,
        travelRuleResult: screeningStatus,
        complianceCheckedAt: new Date(),
        rejectionReason: complianceResult === 'failed' ? `Screening status: ${screeningStatus}` : null,
      },
    });

    if (complianceResult === 'passed') {
      await this.createTransferCheck(instruction, vault, screeningStatus);
    }

    await this.events.emit({
      vaultId: instruction.vaultId,
      actionType: 'TL_COMPLIANCE_EXECUTED',
      actor: 'translation_layer',
      role: 'system',
      result: complianceResult === 'passed' ? 'success' : 'failure',
      reason: `Compliance check ${complianceResult} for ${instruction.instructionType}. Jurisdiction: ${jurisdiction}, Travel Rule: ${screeningStatus}`,
      amount: instruction.amount,
      asset: vault?.baseAsset,
      compliancePda: complianceRef,
      travelRulePda: travelRuleRef,
    });

    this.logger.log(`executeCompliance: id=${instructionId}, result=${complianceResult}`);

    return { complianceRef, travelRuleRef, complianceResult };
  }

  async executeAction(instructionId: string): Promise<{ routingRef: string; glEntryRef: string }> {
    const instruction = await this.prisma.translationLayerInstruction.findUnique({
      where: { instructionId },
    });
    if (!instruction) throw new NotFoundException(`Instruction not found: ${instructionId}`);

    if (instruction.status !== 'compliance_checked') {
      if (instruction.status === 'failed') {
        throw new BadRequestException(
          `Instruction ${instructionId} failed compliance and cannot be executed. Reason: ${instruction.rejectionReason || 'Compliance check failed'}`,
        );
      }
      throw new BadRequestException(
        `Instruction ${instructionId} is in status '${instruction.status}', expected 'compliance_checked'. Execute compliance first.`,
      );
    }

    if (instruction.complianceResult !== 'passed') {
      throw new BadRequestException(
        `Instruction ${instructionId} compliance result is '${instruction.complianceResult}', expected 'passed'.`,
      );
    }

    const routingRef = `RT-${instructionId}`;
    const glEntryRef = `GL-${instructionId}`;

    await this.prisma.translationLayerInstruction.update({
      where: { instructionId },
      data: {
        status: 'complete',
        routingRef,
        glEntryRef,
        actionExecutedAt: new Date(),
        completedAt: new Date(),
      },
    });

    await this.createGLEntry(instruction, glEntryRef);

    await this.events.emit({
      vaultId: instruction.vaultId,
      actionType: 'TL_ACTION_EXECUTED',
      actor: 'translation_layer',
      role: 'system',
      result: 'success',
      reason: `Action executed for ${instruction.instructionType}. Routed, GL entry ${glEntryRef} created as pending approval.`,
      amount: instruction.amount,
      routingPda: routingRef,
      glEntryPda: glEntryRef,
    });

    this.logger.log(`executeAction: id=${instructionId}, routingRef=${routingRef}, glEntryRef=${glEntryRef}`);

    return { routingRef, glEntryRef };
  }

  async getPipelineStatus(instructionId: string) {
    const instruction = await this.prisma.translationLayerInstruction.findUnique({
      where: { instructionId },
    });
    if (!instruction) throw new NotFoundException(`Instruction not found: ${instructionId}`);

    return {
      instructionId: instruction.instructionId,
      instructionType: instruction.instructionType,
      vaultId: instruction.vaultId,
      amount: instruction.amount,
      jurisdiction: instruction.jurisdiction,
      strategyId: instruction.strategyId,
      status: instruction.status,
      complianceResult: instruction.complianceResult,
      complianceRef: instruction.complianceRef,
      travelRuleRef: instruction.travelRuleRef,
      travelRuleResult: instruction.travelRuleResult,
      routingRef: instruction.routingRef,
      glEntryRef: instruction.glEntryRef,
      glEntryType: instruction.glEntryType,
      glDirection: instruction.glDirection,
      initiator: instruction.initiator,
      rejectionReason: instruction.rejectionReason,
      receivedAt: instruction.receivedAt,
      complianceCheckedAt: instruction.complianceCheckedAt,
      actionExecutedAt: instruction.actionExecutedAt,
      completedAt: instruction.completedAt,
    };
  }

  async getInstructionHistory(vaultId: string) {
    const instructions = await this.prisma.translationLayerInstruction.findMany({
      where: { vaultId },
      orderBy: { receivedAt: 'desc' },
      take: 50,
    });

    return instructions.map((inst) => ({
      instructionId: inst.instructionId,
      instructionType: inst.instructionType,
      vaultId: inst.vaultId,
      amount: inst.amount,
      jurisdiction: inst.jurisdiction,
      strategyId: inst.strategyId,
      status: inst.status,
      pipelineStatus: inst.status,
      complianceRef: inst.complianceRef,
      complianceResult: inst.complianceResult,
      travelRuleRef: inst.travelRuleRef,
      routingRef: inst.routingRef,
      glEntryRef: inst.glEntryRef,
      glEntryType: inst.glEntryType,
      glDirection: inst.glDirection,
      receivedAt: inst.receivedAt,
      completedAt: inst.completedAt,
    }));
  }

  async getConfig() {
    const [totalInstructions, totalVaults] = await Promise.all([
      this.prisma.translationLayerInstruction.count(),
      this.prisma.vault.count(),
    ]);

    const byType = await this.prisma.translationLayerInstruction.groupBy({
      by: ['instructionType'],
      _count: { instructionType: true },
    });

    const typeBreakdown: Record<string, number> = {};
    for (const row of byType) {
      typeBreakdown[row.instructionType] = row._count.instructionType;
    }

    const byStatus = await this.prisma.translationLayerInstruction.groupBy({
      by: ['status'],
      _count: { status: true },
    });

    const statusBreakdown: Record<string, number> = {};
    for (const row of byStatus) {
      statusBreakdown[row.status] = row._count.status;
    }

    return {
      totalInstructions,
      totalVaults,
      typeBreakdown,
      statusBreakdown,
      layers: {
        l3: 'Crypto Services (Vault Operations)',
        l2: 'Translation Layer (Compliance Orchestration)',
        l1: 'Finstar Core Banking (GL Entries)',
      },
    };
  }

  private async resolveScreeningStatus(instruction: any): Promise<string> {
    if (instruction.instructionType === 'DEPOSIT') {
      const deposit = await this.prisma.deposit.findFirst({
        where: { vaultId: instruction.vaultId },
        orderBy: { createdAt: 'desc' },
      });
      return deposit?.screeningStatus || 'Clear';
    }

    if (instruction.instructionType === 'ALLOCATE' || instruction.instructionType === 'REDEEM') {
      return 'Clear';
    }

    if (instruction.instructionType === 'UNWIND') {
      return 'Clear';
    }

    if (instruction.instructionType === 'PAUSE') {
      return 'Clear';
    }

    if (instruction.instructionType === 'MANDATE_UPDATE') {
      return 'Clear';
    }

    return 'Clear';
  }

  private async createTransferCheck(instruction: any, vault: any, screeningStatus: string) {
    const type = instruction.instructionType;

    const transferCheckData: any = {
      transferId: instruction.instructionId,
      vaultId: instruction.vaultId,
      asset: vault?.baseAsset || 'USDC',
      amount: instruction.amount,
      kytStatus: screeningStatus === 'Clear' ? 'CLEAR' : 'FLAGGED',
      ofacStatus: 'CLEAR',
      overallStatus: 'PASSED',
    };

    if (type === 'DEPOSIT') {
      transferCheckData.transferType = 'DEPOSIT';
      transferCheckData.fromAddress = instruction.initiator || 'client';
      transferCheckData.fromController = 'Client Account';
      transferCheckData.toAddress = `VAULT/${instruction.vaultId}`;
      transferCheckData.toController = 'Segregated Vault';
      transferCheckData.travelRuleStatus = instruction.amount >= 1000 ? 'COMPLETE' : 'NOT_REQUIRED';
    } else if (type === 'ALLOCATE') {
      transferCheckData.transferType = 'ALLOCATION';
      transferCheckData.fromAddress = `VAULT/${instruction.vaultId}`;
      transferCheckData.fromController = 'Segregated Vault';
      transferCheckData.toAddress = `STRATEGY/${instruction.strategyId || 'unknown'}`;
      transferCheckData.toController = 'Strategy Provider';
      transferCheckData.travelRuleStatus = 'NOT_REQUIRED';
    } else if (type === 'REDEEM') {
      transferCheckData.transferType = 'REDEMPTION';
      transferCheckData.fromAddress = `VAULT/${instruction.vaultId}`;
      transferCheckData.fromController = 'Segregated Vault';
      transferCheckData.toAddress = 'Client Redemption Wallet';
      transferCheckData.toController = 'Client Account';
      transferCheckData.travelRuleStatus = instruction.amount >= 1000 ? 'COMPLETE' : 'NOT_REQUIRED';
    } else if (type === 'UNWIND') {
      transferCheckData.transferType = 'UNWIND';
      transferCheckData.fromAddress = `STRATEGY/${instruction.strategyId || 'unknown'}`;
      transferCheckData.fromController = 'Strategy Provider';
      transferCheckData.toAddress = `VAULT/${instruction.vaultId}`;
      transferCheckData.toController = 'Segregated Vault';
      transferCheckData.travelRuleStatus = 'NOT_REQUIRED';
    } else {
      return;
    }

    try {
      await this.prisma.transferCheck.create({ data: transferCheckData });
    } catch (err: any) {
      this.logger.error(`Failed to create TransferCheck: ${err.message}`);
    }
  }

  private async createGLEntry(instruction: any, glEntryRef: string) {
    const vault = await this.prisma.vault.findUnique({
      where: { vaultId: instruction.vaultId },
    });
    if (!vault) return;

    const type = instruction.instructionType;
    const accounts = GL_ACCOUNTS[type] || { debitAccount: 'UNKNOWN', creditAccount: 'UNKNOWN' };

    let narrative = '';
    switch (type) {
      case 'DEPOSIT':
        narrative = `Deposit of ${instruction.amount} ${vault.baseAsset} into vault ${instruction.vaultId}`;
        break;
      case 'ALLOCATE':
        narrative = `Allocation of ${instruction.amount} ${vault.baseAsset} to strategy ${instruction.strategyId}`;
        break;
      case 'REDEEM':
        narrative = `Redemption of ${instruction.amount} ${vault.baseAsset} from vault ${instruction.vaultId}`;
        break;
      case 'UNWIND':
        narrative = `Unwind of ${instruction.amount} ${vault.baseAsset} from strategy ${instruction.strategyId}`;
        break;
      case 'PAUSE':
        narrative = `Vault ${instruction.vaultId} paused — operational control flag`;
        break;
      case 'MANDATE_UPDATE':
        narrative = `Mandate update for vault ${instruction.vaultId} — configuration record`;
        break;
      default:
        narrative = `${type} instruction for vault ${instruction.vaultId}`;
    }

    const isOperational = type === 'PAUSE' || type === 'MANDATE_UPDATE';

    try {
      await this.prisma.gLEntry.create({
        data: {
          entryId: glEntryRef,
          vaultId: instruction.vaultId,
          instructionId: instruction.instructionId,
          entryType: instruction.glEntryType || GL_ENTRY_MAP[type],
          direction: instruction.glDirection || GL_DIRECTION_MAP[type],
          amount: instruction.amount,
          currency: vault.baseAsset,
          debitAccount: accounts.debitAccount,
          creditAccount: accounts.creditAccount,
          narrative,
          swiftReference: `AMINCHZZXXX-${instruction.instructionId}`,
          jurisdiction: instruction.jurisdiction,
          status: isOperational ? 'posted' : 'pending',
          sourceType: 'translation_layer',
          sourceId: instruction.instructionId,
        },
      });
      this.logger.log(`Created GL entry ${glEntryRef} (pending approval) for vault ${instruction.vaultId}`);
    } catch (err: any) {
      this.logger.error(`Failed to create GL entry: ${err.message}`);
    }
  }
}
