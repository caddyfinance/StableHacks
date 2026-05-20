import { Controller, Post, Get, Body, Param, Query, Logger, Inject, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiQuery, ApiOkResponse, ApiCreatedResponse, ApiForbiddenResponse } from '@nestjs/swagger';
import { Request } from 'express';
import { TranslationLayerService } from './translation-layer.service';
import { EventsService } from '../events/events.service';
import { PrismaService } from '../prisma/prisma.service';
import { Roles } from '../auth/roles.guard';

@ApiTags('Translation Layer')
@Controller('translation-layer')
export class TranslationLayerController {
  private readonly logger = new Logger(TranslationLayerController.name);

  constructor(
    @Inject(TranslationLayerService) private readonly translationLayerService: TranslationLayerService,
    @Inject(EventsService) private readonly events: EventsService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  @Post('submit')
  @Roles('admin', 'portfolio_manager')
  @ApiOperation({ summary: 'Submit instruction to translation layer', description: 'Submit a new instruction (Deposit, Allocate, Redeem, Unwind, Pause, MandateUpdate) to the compliance pipeline.' })
  @ApiCreatedResponse({ description: 'Instruction submitted successfully.' })
  async submitInstruction(
    @Body()
    body: {
      instructionType: string;
      vaultId: string;
      amount: number;
      jurisdiction: string;
      strategyId: string;
    },
    @Req() req: Request,
  ) {
    const role = (req.headers['x-role'] as string) || 'portfolio_manager';
    this.logger.log(
      `POST /api/translation-layer/submit: type=${body.instructionType}, vault=${body.vaultId}, amount=${body.amount}`,
    );

    const result = await this.translationLayerService.submitInstruction(
      body.instructionType,
      body.vaultId,
      body.amount,
      body.jurisdiction,
      body.strategyId,
      role,
    );

    await this.events.emit({
      vaultId: body.vaultId,
      actionType: 'TL_INSTRUCTION_SUBMITTED',
      actor: role,
      role: role === 'admin' ? 'Admin' : 'Portfolio Manager',
      asset: 'USDC',
      amount: body.amount,
      strategy: body.strategyId,
      result: 'success',
      reason: `Translation layer instruction submitted: type=${body.instructionType}, jurisdiction=${body.jurisdiction}`,
      translationLayerRef: result.instructionId,
    });

    return {
      success: true,
      data: {
        ...result,
        recordRef: result.dbRef,
        trackingRef: `db-${result.instructionId}`,
      },
    };
  }

  @Post(':id/compliance')
  @Roles('admin', 'portfolio_manager')
  @ApiOperation({ summary: 'Execute compliance checks', description: 'Run jurisdiction + travel rule compliance checks for a submitted instruction.' })
  @ApiParam({ name: 'id', description: 'Instruction ID from submit step' })
  async executeCompliance(
    @Param('id') instructionId: string,
    @Body() body: { jurisdiction: string; vaultId?: string },
    @Req() req: Request,
  ) {
    const role = (req.headers['x-role'] as string) || 'portfolio_manager';
    this.logger.log(`POST /api/translation-layer/${instructionId}/compliance: jurisdiction=${body.jurisdiction}`);

    const result = await this.translationLayerService.executeCompliance(instructionId, body.jurisdiction);

    let vaultId = body.vaultId;
    if (!vaultId) {
      const submitEvent = await this.prisma.complianceEvent.findFirst({
        where: { translationLayerRef: instructionId, actionType: 'TL_INSTRUCTION_SUBMITTED' },
        select: { vaultId: true },
      });
      vaultId = submitEvent?.vaultId || undefined;
    }

    await this.events.emit({
      vaultId,
      actionType: 'TL_COMPLIANCE_EXECUTED',
      actor: role,
      role: role === 'admin' ? 'Admin' : 'Portfolio Manager',
      asset: 'USDC',
      result: 'success',
      reason: `Compliance checks passed for instruction ${instructionId}: jurisdiction=${body.jurisdiction}`,
      translationLayerRef: instructionId,
      compliancePda: result.complianceRef,
      travelRulePda: result.travelRuleRef,
    });

    return {
      success: true,
      data: {
        ...result,
        complianceRef: result.complianceRef,
        travelRuleRef: result.travelRuleRef,
        trackingRef: `db-${instructionId}-compliance`,
      },
    };
  }

  @Post(':id/action')
  @Roles('admin', 'portfolio_manager')
  @ApiOperation({ summary: 'Execute action (routing + GL)', description: 'Execute venue routing and general ledger entry for a compliant instruction.' })
  @ApiParam({ name: 'id', description: 'Instruction ID from submit step' })
  async executeAction(
    @Param('id') instructionId: string,
    @Req() req: Request,
  ) {
    const role = (req.headers['x-role'] as string) || 'portfolio_manager';
    this.logger.log(`POST /api/translation-layer/${instructionId}/action`);

    const result = await this.translationLayerService.executeAction(instructionId);

    const submitEvent = await this.prisma.complianceEvent.findFirst({
      where: { translationLayerRef: instructionId, actionType: 'TL_INSTRUCTION_SUBMITTED' },
      select: { vaultId: true, amount: true, asset: true },
    });

    await this.events.emit({
      vaultId: submitEvent?.vaultId || undefined,
      actionType: 'TL_ACTION_EXECUTED',
      actor: role,
      role: role === 'admin' ? 'Admin' : 'Portfolio Manager',
      asset: submitEvent?.asset || 'USDC',
      amount: submitEvent?.amount || undefined,
      result: 'success',
      reason: `Action executed for instruction ${instructionId}: routing recorded, GL entry posted to Finstar`,
      translationLayerRef: instructionId,
      routingPda: result.routingRef,
      glEntryPda: result.glEntryRef,
    });

    return {
      success: true,
      data: {
        ...result,
        routingRef: result.routingRef,
        glEntryRef: result.glEntryRef,
        trackingRef: `db-${instructionId}-action`,
      },
    };
  }

  @Get(':id/status')
  @Roles('admin', 'portfolio_manager', 'compliance_officer')
  @ApiOperation({ summary: 'Get pipeline status', description: 'Read the current pipeline status for an instruction from the database.' })
  @ApiParam({ name: 'id', description: 'Instruction ID' })
  async getPipelineStatus(@Param('id') instructionId: string) {
    this.logger.log(`GET /api/translation-layer/${instructionId}/status`);

    const result = await this.translationLayerService.getPipelineStatus(instructionId);

    return {
      success: true,
      data: result,
    };
  }

  @Get('history/:vaultId')
  @Roles('admin', 'portfolio_manager', 'compliance_officer')
  @ApiOperation({ summary: 'Get instruction history for vault', description: 'Retrieve all translation layer instructions for a vault from the database.' })
  @ApiParam({ name: 'vaultId', description: 'Vault identifier' })
  async getInstructionHistory(@Param('vaultId') vaultId: string) {
    this.logger.log(`GET /api/translation-layer/history/${vaultId}`);

    const [tlInstructions, deposits, allocations, credential] = await Promise.all([
      this.prisma.translationLayerInstruction.findMany({
        where: { vaultId },
        orderBy: { receivedAt: 'desc' },
        take: 50,
      }),
      this.prisma.deposit.findMany({
        where: { vaultId },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      this.prisma.allocation.findMany({
        where: { vaultId },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: { strategy: { select: { name: true } } },
      }),
      this.prisma.vault.findUnique({
        where: { vaultId },
        select: { credentialId: true, credential: { select: { jurisdiction: true } } },
      }),
    ]);

    const history: any[] = [];

    for (const inst of tlInstructions) {
      history.push({
        instructionId: inst.instructionId,
        instructionType: inst.instructionType,
        vaultId: inst.vaultId,
        amount: inst.amount,
        jurisdiction: inst.jurisdiction,
        strategy: inst.strategyId,
        status: inst.status,
        pipelineStatus: inst.status,
        complianceRef: inst.complianceRef,
        travelRuleRef: inst.travelRuleRef,
        routingRef: inst.routingRef,
        glEntryRef: inst.glEntryRef,
        glEntryType: inst.glEntryType,
        glDirection: inst.glDirection,
        receivedAt: inst.receivedAt,
        completedAt: inst.completedAt,
        source: 'pipeline',
      });
    }

    const jurisdiction = credential?.credential?.jurisdiction || 'CH';

    for (const dep of deposits) {
      const existingTl = tlInstructions.find(t => t.instructionType === 'DEPOSIT' && Math.abs(t.amount - dep.amount) < 0.01);
      if (!existingTl) {
        history.push({
          instructionId: `DEP-${dep.id.slice(0, 8).toUpperCase()}`,
          instructionType: 'DEPOSIT',
          vaultId: dep.vaultId,
          amount: dep.amount,
          jurisdiction: dep.jurisdictionTag || jurisdiction,
          strategy: null,
          status: 'complete',
          pipelineStatus: 'complete',
          receivedAt: dep.createdAt,
          completedAt: dep.createdAt,
          sourceWallet: dep.sourceWallet,
          sourceReference: dep.sourceReference,
          screeningStatus: dep.screeningStatus,
          glEntryType: 'Deposit',
          glDirection: 'credit',
          source: 'deposit',
        });
      }
    }

    for (const alloc of allocations) {
      const isUnwind = alloc.status === 'unwound';
      const allocType = isUnwind ? 'UNWIND' : 'ALLOCATE';
      const existingTl = tlInstructions.find(t => t.instructionType === allocType && Math.abs(t.amount - alloc.amount) < 0.01);
      if (!existingTl) {
        history.push({
          instructionId: `${isUnwind ? 'UNW' : 'ALC'}-${alloc.id.slice(0, 8).toUpperCase()}`,
          instructionType: allocType,
          vaultId: alloc.vaultId,
          amount: alloc.amount,
          jurisdiction,
          strategy: alloc.strategy.name,
          status: 'complete',
          pipelineStatus: 'complete',
          receivedAt: alloc.createdAt,
          completedAt: alloc.updatedAt,
          glEntryType: isUnwind ? 'StrategyUnwind' : 'StrategyAllocation',
          glDirection: isUnwind ? 'credit' : 'debit',
          source: 'allocation',
        });
      }
    }

    history.sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime());

    return {
      success: true,
      data: history,
    };
  }

  @Get('config')
  @Roles('admin', 'portfolio_manager', 'compliance_officer')
  @ApiOperation({ summary: 'Get translation layer config', description: 'Returns translation layer operational summary derived from actual vault activity.' })
  async getConfig() {
    this.logger.log(`GET /api/translation-layer/config`);

    const config = await this.translationLayerService.getConfig();

    return {
      success: true,
      data: config,
    };
  }

  @Get('activity')
  @Roles('admin', 'portfolio_manager', 'compliance_officer')
  @ApiOperation({ summary: 'Get pipeline activity log', description: 'Returns translation layer activity derived from real vault operations showing L3→L2→L1 flow per vault.' })
  @ApiQuery({ name: 'vaultId', required: false, description: 'Filter by vault ID' })
  async getActivity(@Query('vaultId') vaultId?: string) {
    this.logger.log(`GET /api/translation-layer/activity vaultId=${vaultId || 'all'}`);

    const depositWhere: any = {};
    const allocationWhere: any = {};
    const tlWhere: any = {};
    if (vaultId) {
      depositWhere.vaultId = vaultId;
      allocationWhere.vaultId = vaultId;
      tlWhere.vaultId = vaultId;
    }

    const [deposits, allocations, tlInstructions, vaults] = await Promise.all([
      this.prisma.deposit.findMany({
        where: depositWhere,
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: { vault: { select: { clientReference: true, baseAsset: true, credentialId: true, ownerWallet: true } } },
      }),
      this.prisma.allocation.findMany({
        where: allocationWhere,
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: {
          vault: { select: { clientReference: true, baseAsset: true, credentialId: true } },
          strategy: { select: { name: true, strategyId: true } },
        },
      }),
      this.prisma.translationLayerInstruction.findMany({
        where: tlWhere,
        orderBy: { receivedAt: 'desc' },
        take: 50,
      }),
      vaultId
        ? this.prisma.vault.findMany({ where: { vaultId }, select: { vaultId: true, totalNAV: true, idleBalance: true, totalDeposited: true, baseAsset: true, clientReference: true } })
        : this.prisma.vault.findMany({ select: { vaultId: true, totalNAV: true, idleBalance: true, totalDeposited: true, baseAsset: true, clientReference: true } }),
    ]);

    const activity: any[] = [];

    for (const dep of deposits) {
      const matchingTl = tlInstructions.find(
        t => t.instructionType === 'DEPOSIT' && t.vaultId === dep.vaultId && Math.abs(t.amount - dep.amount) < 0.01,
      );

      activity.push({
        id: dep.id,
        vaultId: dep.vaultId,
        actionType: 'DEPOSIT',
        layer: 'L3→L2',
        layerLabel: 'Deposit received → Compliance check → GL book-back',
        actor: dep.sourceWallet,
        role: 'Client',
        asset: dep.vault.baseAsset,
        amount: dep.amount,
        strategy: null,
        result: 'success',
        reason: `Deposit of ${dep.amount.toLocaleString()} ${dep.vault.baseAsset} from ${dep.sourceReference}`,
        jurisdiction: dep.jurisdictionTag,
        screeningStatus: dep.screeningStatus,
        sourceType: dep.sourceType,
        pipelineSteps: {
          received: { status: 'complete', timestamp: dep.createdAt },
          complianceCheck: { status: dep.screeningStatus === 'Clear' ? 'complete' : 'flagged', result: dep.screeningStatus },
          glBookBack: { status: 'complete', entryType: 'Deposit', direction: 'credit' },
        },
        tlInstruction: matchingTl ? {
          instructionId: matchingTl.instructionId,
          status: matchingTl.status,
          complianceRef: matchingTl.complianceRef,
          routingRef: matchingTl.routingRef,
          glEntryRef: matchingTl.glEntryRef,
        } : null,
        timestamp: dep.createdAt,
      });
    }

    for (const alloc of allocations) {
      const isUnwind = alloc.status === 'unwound';
      const allocType = isUnwind ? 'UNWIND' : 'ALLOCATE';
      const matchingTl = tlInstructions.find(
        t => t.instructionType === allocType && t.vaultId === alloc.vaultId && Math.abs(t.amount - alloc.amount) < 0.01,
      );

      activity.push({
        id: alloc.id,
        vaultId: alloc.vaultId,
        actionType: isUnwind ? 'UNWIND' : 'ALLOCATION',
        layer: isUnwind ? 'L2→L1' : 'L3→L2',
        layerLabel: isUnwind
          ? `Strategy unwind → GL credit book-back`
          : `Allocation → Compliance check → GL debit book-back`,
        actor: 'portfolio_manager',
        role: 'Portfolio Manager',
        asset: alloc.vault.baseAsset,
        amount: alloc.amount,
        strategy: alloc.strategy.name,
        result: 'success',
        reason: isUnwind
          ? `Unwound ${alloc.amount.toLocaleString()} ${alloc.vault.baseAsset} from ${alloc.strategy.name}`
          : `Allocated ${alloc.amount.toLocaleString()} ${alloc.vault.baseAsset} to ${alloc.strategy.name}`,
        pipelineSteps: {
          received: { status: 'complete', timestamp: alloc.createdAt },
          complianceCheck: { status: 'complete', result: 'Clear' },
          glBookBack: { status: 'complete', entryType: isUnwind ? 'StrategyUnwind' : 'StrategyAllocation', direction: isUnwind ? 'credit' : 'debit' },
        },
        tlInstruction: matchingTl ? {
          instructionId: matchingTl.instructionId,
          status: matchingTl.status,
          complianceRef: matchingTl.complianceRef,
          routingRef: matchingTl.routingRef,
          glEntryRef: matchingTl.glEntryRef,
        } : null,
        timestamp: alloc.createdAt,
      });
    }

    activity.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    const totalDeposits = deposits.reduce((sum, d) => sum + d.amount, 0);
    const totalAllocations = allocations.filter(a => a.status === 'active').reduce((sum, a) => sum + a.amount, 0);
    const totalUnwinds = allocations.filter(a => a.status === 'unwound').reduce((sum, a) => sum + a.amount, 0);

    const summary = {
      totalEvents: activity.length,
      l3Events: deposits.length + allocations.filter(a => a.status === 'active').length,
      l2Events: tlInstructions.length,
      l1Events: activity.length,
      totalValueProcessed: totalDeposits + totalAllocations + totalUnwinds,
      breakdown: {
        deposits: { count: deposits.length, total: totalDeposits },
        allocations: { count: allocations.filter(a => a.status === 'active').length, total: totalAllocations },
        unwinds: { count: allocations.filter(a => a.status === 'unwound').length, total: totalUnwinds },
      },
      vaultSummaries: vaults.map(v => ({
        vaultId: v.vaultId,
        clientReference: v.clientReference,
        totalNAV: v.totalNAV,
        idleBalance: v.idleBalance,
        totalDeposited: v.totalDeposited,
      })),
    };

    return {
      success: true,
      data: { summary, activity },
    };
  }
}
