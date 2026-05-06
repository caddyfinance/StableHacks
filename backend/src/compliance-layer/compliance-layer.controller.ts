import { Controller, Get, Param, Query, Logger } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ComplianceLayerService } from './compliance-layer.service';
import { Roles } from '../auth/roles.guard';

@ApiTags('Compliance Layer')
@Controller('compliance')
export class ComplianceLayerController {
  private readonly logger = new Logger(ComplianceLayerController.name);

  constructor(private readonly complianceService: ComplianceLayerService) {}

  // ─── Health Check ─────────────────────────────────────────────

  @Get('health-check')
  @Roles('admin', 'compliance_officer')
  async runHealthCheck() {
    this.logger.log('GET /api/compliance/health-check');
    return this.complianceService.runHealthCheck();
  }

  // ─── Travel Rule (Notabene) ───────────────────────────────────

  @Get('travel-rule/:checkId')
  @Roles('admin', 'portfolio_manager', 'compliance_officer')
  async getTravelRuleCheck(@Param('checkId') checkId: string) {
    this.logger.log(`GET /api/compliance/travel-rule/${checkId}`);
    const result = await this.complianceService.getTravelRuleCheck(checkId);
    if (!result) {
      return { error: 'TravelRuleCheck not found', checkId };
    }
    return result;
  }

  @Get('travel-rule')
  @Roles('admin', 'portfolio_manager', 'compliance_officer')
  async getTravelRuleChecksForVault(@Query('vaultId') vaultId: string) {
    this.logger.log(`GET /api/compliance/travel-rule?vaultId=${vaultId}`);
    if (!vaultId) {
      return { error: 'vaultId query parameter required' };
    }
    const results = await this.complianceService.getTravelRuleChecksForVault(vaultId);
    return { vaultId, checks: results, count: results.length };
  }

  @Get('vasps')
  @Roles('admin', 'portfolio_manager', 'compliance_officer')
  async getVASPs() {
    this.logger.log(`GET /api/compliance/vasps`);
    const results = await this.complianceService.getVASPs();
    return { vasps: results, count: results.length };
  }

  // ─── Venue Routing (Mesh) ─────────────────────────────────────

  @Get('venues')
  @Roles('admin', 'portfolio_manager', 'compliance_officer')
  async getVenues() {
    this.logger.log(`GET /api/compliance/venues`);
    const results = await this.complianceService.getVenues();
    return { venues: results, count: results.length };
  }

  @Get('routing/:vaultId')
  @Roles('admin', 'portfolio_manager', 'compliance_officer')
  async getRoutingDecisionsForVault(@Param('vaultId') vaultId: string) {
    this.logger.log(`GET /api/compliance/routing/${vaultId}`);
    const results = await this.complianceService.getRoutingDecisionsForVault(vaultId);
    return { vaultId, routingDecisions: results, count: results.length };
  }

  // ─── Jurisdiction Engine ──────────────────────────────────────

  @Get('jurisdictions')
  @Roles('admin', 'portfolio_manager', 'compliance_officer')
  async getJurisdictions() {
    this.logger.log(`GET /api/compliance/jurisdictions`);
    const results = await this.complianceService.getJurisdictions();
    return { jurisdictions: results, count: results.length };
  }

  @Get('jurisdictions/:code')
  @Roles('admin', 'portfolio_manager', 'compliance_officer')
  async getJurisdiction(@Param('code') code: string) {
    this.logger.log(`GET /api/compliance/jurisdictions/${code}`);
    const result = await this.complianceService.getJurisdiction(code);
    if (!result) {
      return { error: 'Jurisdiction not found', code };
    }
    return result;
  }

  @Get('attestations/:vaultId')
  @Roles('admin', 'portfolio_manager', 'compliance_officer')
  async getComplianceAttestationsForVault(@Param('vaultId') vaultId: string) {
    this.logger.log(`GET /api/compliance/attestations/${vaultId}`);
    const results = await this.complianceService.getComplianceAttestationsForVault(vaultId);
    return { vaultId, attestations: results, count: results.length };
  }
}
