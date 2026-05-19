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
  @ApiOperation({ summary: 'Submit instruction to translation layer', description: 'Submit a new instruction (Deposit, Allocate, Redeem, Unwind, Pause, MandateUpdate) to the on-chain compliance pipeline.' })
  @ApiCreatedResponse({ description: 'Instruction submitted successfully.' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions.' })
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
      txSignature: result.txSignature,
      translationLayerRef: result.instructionId,
      onChainAddress: result.pda,
    });

    return {
      success: true,
      data: result,
    };
  }

  @Post(':id/compliance')
  @Roles('admin', 'portfolio_manager')
  @ApiOperation({ summary: 'Execute compliance checks', description: 'Run jurisdiction + travel rule compliance checks (CPI to Jurisdiction Engine + Notabene) for a submitted instruction.' })
  @ApiParam({ name: 'id', description: 'Instruction ID from submit step' })
  @ApiCreatedResponse({ description: 'Compliance checks executed successfully.' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions.' })
  async executeCompliance(
    @Param('id') instructionId: string,
    @Body() body: { jurisdiction: string; vaultId?: string },
    @Req() req: Request,
  ) {
    const role = (req.headers['x-role'] as string) || 'portfolio_manager';
    this.logger.log(`POST /api/translation-layer/${instructionId}/compliance: jurisdiction=${body.jurisdiction}`);

    const result = await this.translationLayerService.executeCompliance(instructionId, body.jurisdiction);

    // Resolve vaultId from body or from the most recent TL_INSTRUCTION_SUBMITTED event
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
      txSignature: result.txSignature,
      translationLayerRef: instructionId,
      compliancePda: result.compliancePda,
      travelRulePda: result.travelRulePda,
    });

    return {
      success: true,
      data: result,
    };
  }

  @Post(':id/action')
  @Roles('admin', 'portfolio_manager')
  @ApiOperation({ summary: 'Execute action (routing + GL)', description: 'Execute venue routing (Mesh CPI) and general ledger entry (Finstar CPI) for a compliant instruction.' })
  @ApiParam({ name: 'id', description: 'Instruction ID from submit step' })
  @ApiCreatedResponse({ description: 'Action executed successfully.' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions.' })
  async executeAction(
    @Param('id') instructionId: string,
    @Req() req: Request,
  ) {
    const role = (req.headers['x-role'] as string) || 'portfolio_manager';
    this.logger.log(`POST /api/translation-layer/${instructionId}/action`);

    const result = await this.translationLayerService.executeAction(instructionId);

    // Resolve vaultId from the original submit event
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
      txSignature: result.txSignature,
      translationLayerRef: instructionId,
      routingPda: result.routingPda,
      glEntryPda: result.glEntryPda,
    });

    return {
      success: true,
      data: result,
    };
  }

  @Get(':id/status')
  @Roles('admin', 'portfolio_manager', 'compliance_officer')
  @ApiOperation({ summary: 'Get pipeline status', description: 'Read the on-chain InstructionLog PDA to get the current pipeline status for an instruction.' })
  @ApiParam({ name: 'id', description: 'Instruction ID' })
  @ApiOkResponse({ description: 'Returns instruction pipeline status.' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions.' })
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
  @ApiOperation({ summary: 'Get instruction history for vault', description: 'Retrieve all translation layer instructions associated with a vault.' })
  @ApiParam({ name: 'vaultId', description: 'Vault identifier' })
  @ApiOkResponse({ description: 'Returns array of instruction records.' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions.' })
  async getInstructionHistory(@Param('vaultId') vaultId: string) {
    this.logger.log(`GET /api/translation-layer/history/${vaultId}`);

    // Try on-chain first, fall back to database events if unavailable
    let onChainHistory: any[] = [];
    try {
      onChainHistory = await this.translationLayerService.getInstructionHistory(vaultId);
    } catch {
      this.logger.warn(`Could not read on-chain history for vault ${vaultId} — using database`);
    }

    // Always provide database-sourced instruction history
    const dbEvents = await this.prisma.complianceEvent.findMany({
      where: {
        vaultId,
        actionType: { in: ['TL_INSTRUCTION_SUBMITTED', 'TL_COMPLIANCE_EXECUTED', 'TL_ACTION_EXECUTED'] },
      },
      orderBy: { timestamp: 'desc' },
      take: 50,
    });

    // Group by translationLayerRef to build instruction records
    const instructionMap = new Map<string, any>();
    for (const evt of dbEvents) {
      const ref = evt.translationLayerRef || evt.eventId;
      if (!instructionMap.has(ref)) {
        instructionMap.set(ref, {
          instructionId: ref,
          instructionType: 'DEPOSIT',
          vaultId: evt.vaultId,
          amount: evt.amount,
          jurisdiction: null,
          status: 'pending',
          receivedAt: evt.timestamp,
          complianceAttestationPda: null,
          travelRuleCheckPda: null,
          routingDecisionPda: null,
          glEntryPda: null,
          pipelineStatus: 'received',
        });
      }
      const record = instructionMap.get(ref)!;
      if (evt.actionType === 'TL_INSTRUCTION_SUBMITTED') {
        record.receivedAt = evt.timestamp;
        record.amount = evt.amount;
        const match = evt.reason?.match(/type=(\w+)/);
        if (match) record.instructionType = match[1];
        const jurMatch = evt.reason?.match(/jurisdiction=(\w+)/);
        if (jurMatch) record.jurisdiction = jurMatch[1];
      }
      if (evt.actionType === 'TL_COMPLIANCE_EXECUTED') {
        record.status = 'compliance_checked';
        record.pipelineStatus = 'compliance_checked';
        record.complianceAttestationPda = evt.compliancePda;
        record.travelRuleCheckPda = evt.travelRulePda;
      }
      if (evt.actionType === 'TL_ACTION_EXECUTED') {
        record.status = 'complete';
        record.pipelineStatus = 'complete';
        record.routingDecisionPda = evt.routingPda;
        record.glEntryPda = evt.glEntryPda;
      }
    }

    // Merge on-chain data if available, otherwise use DB
    const history = onChainHistory.length > 0
      ? onChainHistory
      : Array.from(instructionMap.values());

    return {
      success: true,
      data: history,
    };
  }

  @Get('config')
  @Roles('admin', 'portfolio_manager', 'compliance_officer')
  @ApiOperation({ summary: 'Get translation layer config', description: 'Read the on-chain TranslationLayerConfig PDA.' })
  @ApiOkResponse({ description: 'Returns translation layer configuration.' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions.' })
  async getConfig() {
    this.logger.log(`GET /api/translation-layer/config`);

    // Count total instructions from the event log
    const totalInstructions = await this.prisma.complianceEvent.count({
      where: { actionType: 'TL_INSTRUCTION_SUBMITTED' },
    });

    // Try to read on-chain config PDA for additional info
    let onChainConfig: any = null;
    try {
      onChainConfig = await this.translationLayerService.getConfig();
    } catch {
      this.logger.warn('Could not read on-chain TL config PDA — using database counts');
    }

    return {
      success: true,
      data: {
        totalInstructions,
        onChainPda: onChainConfig?.pda || null,
        connectedPrograms: {
          finstar: '7jH9Lhe9Ny3a8LxUsS3BCSHoDKmQZz5Vpu1py4pemisF',
          notabene: 'FZ5EaUHqohNGBdsvjr4LYnK181xoBWNhZiUg1iTaf9f7',
          mesh: '3ptgmaf1dWrn8WsmRsat641srbbY1vfBvhMwVwczpoU2',
          jurisdictionEngine: 'HhPHx1RgzA99brCGprSg5VwJ8ZRgeXkLADbDRUox3Cq6',
        },
      },
    };
  }

  @Get('activity')
  @Roles('admin', 'portfolio_manager', 'compliance_officer')
  @ApiOperation({ summary: 'Get pipeline activity log', description: 'Returns all translation layer activity from the compliance event database, showing L3→L2→L1 interactions with values.' })
  @ApiQuery({ name: 'vaultId', required: false, description: 'Filter by vault ID' })
  @ApiOkResponse({ description: 'Returns array of pipeline activity records with layer interactions.' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions.' })
  async getActivity(@Query('vaultId') vaultId?: string) {
    this.logger.log(`GET /api/translation-layer/activity vaultId=${vaultId || 'all'}`);

    const where: any = {
      actionType: {
        in: [
          'TL_INSTRUCTION_SUBMITTED',
          'TL_COMPLIANCE_EXECUTED',
          'TL_ACTION_EXECUTED',
          'DEPOSIT_RECORDED',
          'ALLOCATION_EXECUTED',
          'REDEMPTION_EXECUTED',
          'UNWIND_EXECUTED',
          'ALLOCATION_INITIATED',
        ],
      },
    };
    if (vaultId) where.vaultId = vaultId;

    const events = await this.prisma.complianceEvent.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: 100,
    });

    const activity = events.map((e) => {
      let layer = 'L2';
      let layerLabel = 'Translation Layer';
      if (['DEPOSIT_RECORDED', 'ALLOCATION_EXECUTED', 'REDEMPTION_EXECUTED', 'UNWIND_EXECUTED', 'ALLOCATION_INITIATED'].includes(e.actionType)) {
        layer = 'L3';
        layerLabel = 'Crypto Services';
      }
      if (e.glEntryPda || e.actionType === 'TL_ACTION_EXECUTED') {
        layer = 'L1→L2';
        layerLabel = 'Finstar Book-Back via Translation Layer';
      }
      if (e.actionType === 'TL_COMPLIANCE_EXECUTED') {
        layer = 'L2';
        layerLabel = 'Compliance Orchestration';
      }
      if (e.actionType === 'TL_INSTRUCTION_SUBMITTED') {
        layer = 'L3→L2';
        layerLabel = 'Instruction Received from Crypto Services';
      }

      return {
        id: e.id,
        eventId: e.eventId,
        vaultId: e.vaultId,
        actionType: e.actionType,
        layer,
        layerLabel,
        actor: e.actor,
        role: e.role,
        asset: e.asset,
        amount: e.amount,
        strategy: e.strategy,
        result: e.result,
        reason: e.reason,
        txSignature: e.txSignature,
        onChainAddress: e.onChainAddress,
        translationLayerRef: e.translationLayerRef,
        compliancePda: e.compliancePda,
        travelRulePda: e.travelRulePda,
        routingPda: e.routingPda,
        glEntryPda: e.glEntryPda,
        timestamp: e.timestamp,
      };
    });

    const summary = {
      totalEvents: activity.length,
      l3Events: activity.filter((a) => a.layer.startsWith('L3')).length,
      l2Events: activity.filter((a) => a.layer === 'L2').length,
      l1Events: activity.filter((a) => a.layer.startsWith('L1')).length,
      totalValueProcessed: activity.reduce((sum, a) => sum + (a.amount || 0), 0),
    };

    return {
      success: true,
      data: { summary, activity },
    };
  }
}
