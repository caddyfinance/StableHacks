import { Controller, Post, Get, Body, Param, Logger } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { TranslationLayerService } from './translation-layer.service';
import { Roles } from '../auth/roles.guard';

@ApiTags('Translation Layer')
@Controller('api/translation-layer')
export class TranslationLayerController {
  private readonly logger = new Logger(TranslationLayerController.name);

  constructor(private readonly translationLayerService: TranslationLayerService) {}

  @Post('submit')
  @Roles('admin', 'portfolio_manager')
  async submitInstruction(
    @Body()
    body: {
      instructionType: string;
      vaultId: string;
      amount: number;
      jurisdiction: string;
      strategyId: string;
    },
  ) {
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

    return {
      success: true,
      data: result,
    };
  }

  @Post(':id/compliance')
  @Roles('admin', 'portfolio_manager')
  async executeCompliance(
    @Param('id') instructionId: string,
    @Body() body: { jurisdiction: string },
  ) {
    this.logger.log(`POST /api/translation-layer/${instructionId}/compliance: jurisdiction=${body.jurisdiction}`);

    const result = await this.translationLayerService.executeCompliance(instructionId, body.jurisdiction);

    return {
      success: true,
      data: result,
    };
  }

  @Post(':id/action')
  @Roles('admin', 'portfolio_manager')
  async executeAction(@Param('id') instructionId: string) {
    this.logger.log(`POST /api/translation-layer/${instructionId}/action`);

    const result = await this.translationLayerService.executeAction(instructionId);

    return {
      success: true,
      data: result,
    };
  }

  @Get(':id/status')
  @Roles('admin', 'portfolio_manager', 'compliance_officer')
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
  async getConfig() {
    this.logger.log(`GET /api/translation-layer/config`);

    const result = await this.translationLayerService.getConfig();

    return {
      success: true,
      data: result,
    };
  }
}
