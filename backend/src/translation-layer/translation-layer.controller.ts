import { Controller, Post, Get, Body, Param, Logger, Inject, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiOkResponse, ApiCreatedResponse, ApiForbiddenResponse } from '@nestjs/swagger';
import { Request } from 'express';
import { TranslationLayerService } from './translation-layer.service';
import { EventsService } from '../events/events.service';
import { Roles } from '../auth/roles.guard';

@ApiTags('Translation Layer')
@Controller('translation-layer')
export class TranslationLayerController {
  private readonly logger = new Logger(TranslationLayerController.name);

  constructor(
    @Inject(TranslationLayerService) private readonly translationLayerService: TranslationLayerService,
    @Inject(EventsService) private readonly events: EventsService,
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
    @Body() body: { jurisdiction: string },
    @Req() req: Request,
  ) {
    const role = (req.headers['x-role'] as string) || 'portfolio_manager';
    this.logger.log(`POST /api/translation-layer/${instructionId}/compliance: jurisdiction=${body.jurisdiction}`);

    const result = await this.translationLayerService.executeCompliance(instructionId, body.jurisdiction);

    await this.events.emit({
      actionType: 'TL_COMPLIANCE_EXECUTED',
      actor: role,
      role: role === 'admin' ? 'Admin' : 'Portfolio Manager',
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

    await this.events.emit({
      actionType: 'TL_ACTION_EXECUTED',
      actor: role,
      role: role === 'admin' ? 'Admin' : 'Portfolio Manager',
      result: 'success',
      reason: `Action executed for instruction ${instructionId}: routing recorded, GL entry posted`,
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

    const result = await this.translationLayerService.getInstructionHistory(vaultId);

    return {
      success: true,
      data: result,
    };
  }

  @Get('config')
  @Roles('admin', 'portfolio_manager', 'compliance_officer')
  @ApiOperation({ summary: 'Get translation layer config', description: 'Read the on-chain TranslationLayerConfig PDA.' })
  @ApiOkResponse({ description: 'Returns translation layer configuration.' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions.' })
  async getConfig() {
    this.logger.log(`GET /api/translation-layer/config`);

    const result = await this.translationLayerService.getConfig();

    return {
      success: true,
      data: result,
    };
  }
}
