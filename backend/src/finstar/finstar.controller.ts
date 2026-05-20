import { Controller, Get, Post, Param, Query, Body, Headers, Inject, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiQuery, ApiOkResponse, ApiForbiddenResponse } from '@nestjs/swagger';
import { FinstarService } from './finstar.service';
import { Roles } from '../auth/roles.guard';

@ApiTags('Finstar')
@Controller('finstar')
export class FinstarController {
  private readonly logger = new Logger(FinstarController.name);

  constructor(
    @Inject(FinstarService) private readonly finstarService: FinstarService,
  ) {}

  @Get('config')
  @Roles('admin', 'portfolio_manager', 'compliance_officer')
  @ApiOperation({ summary: 'Get Finstar config', description: 'Returns Finstar core banking configuration and summary metrics derived from vault activity.' })
  async getConfig() {
    return this.finstarService.getConfig();
  }

  @Get('ledger/:vaultId')
  @Roles('admin', 'portfolio_manager', 'compliance_officer')
  @ApiOperation({ summary: 'Get vault ledger', description: 'Returns GL entries for a vault from the persistent GL journal with double-entry bookkeeping totals.' })
  @ApiParam({ name: 'vaultId', description: 'Vault identifier' })
  async getVaultLedger(@Param('vaultId') vaultId: string) {
    return this.finstarService.getVaultLedger(vaultId);
  }

  @Get('entries/:entryId')
  @Roles('admin', 'portfolio_manager', 'compliance_officer')
  @ApiOperation({ summary: 'Get GL entry by ID', description: 'Read a single GL entry from the persistent GL journal.' })
  @ApiParam({ name: 'entryId', description: 'GL entry identifier (e.g. GL-TL-XXXXX)' })
  async getEntry(@Param('entryId') entryId: string) {
    this.logger.log(`GET /api/finstar/entries/${entryId}`);
    return this.finstarService.getEntry(entryId);
  }

  @Get('reports/:vaultId')
  @Roles('admin', 'portfolio_manager', 'compliance_officer')
  @ApiOperation({ summary: 'Get regulatory reports for vault', description: 'Returns compliance reports derived from vault transfer checks.' })
  @ApiParam({ name: 'vaultId', description: 'Vault identifier' })
  async getRegulatoryReports(@Param('vaultId') vaultId: string) {
    return this.finstarService.getRegulatoryReports(vaultId);
  }

  @Get('activity')
  @Roles('admin', 'portfolio_manager', 'compliance_officer')
  @ApiOperation({ summary: 'Get Finstar L1 activity log', description: 'Returns Finstar ledger activity derived from actual vault operations.' })
  @ApiQuery({ name: 'vaultId', required: false, description: 'Filter by vault ID' })
  async getActivity(@Query('vaultId') vaultId?: string) {
    this.logger.log(`GET /api/finstar/activity vaultId=${vaultId || 'all'}`);
    const data = await this.finstarService.getActivity(vaultId);
    return { success: true, data };
  }

  // ─── GL Approval Workflow ──────────────────────────────────────

  @Get('pending')
  @Roles('admin', 'compliance_officer')
  @ApiOperation({ summary: 'List pending GL entries awaiting approval', description: 'Returns all GL entries in pending status that require compliance officer or admin sign-off before posting.' })
  @ApiQuery({ name: 'vaultId', required: false, description: 'Filter by vault ID' })
  async getPendingEntries(@Query('vaultId') vaultId?: string) {
    this.logger.log(`GET /api/finstar/pending vaultId=${vaultId || 'all'}`);
    const entries = await this.finstarService.getPendingEntries(vaultId);
    return { success: true, count: entries.length, entries };
  }

  @Post('approve/:entryId')
  @Roles('admin', 'compliance_officer')
  @ApiOperation({ summary: 'Approve a pending GL entry', description: 'Approve and post a pending GL entry. Requires admin or compliance officer role.' })
  @ApiParam({ name: 'entryId', description: 'GL entry identifier to approve' })
  async approveEntry(
    @Param('entryId') entryId: string,
    @Headers('x-role') role: string,
    @Headers('x-email') email?: string,
  ) {
    this.logger.log(`POST /api/finstar/approve/${entryId} by ${email || role}`);
    const result = await this.finstarService.approveEntry(entryId, role, email);
    return { success: true, data: result };
  }

  @Post('reject/:entryId')
  @Roles('admin', 'compliance_officer')
  @ApiOperation({ summary: 'Reject a pending GL entry', description: 'Reject a pending GL entry with a reason. Requires admin or compliance officer role.' })
  @ApiParam({ name: 'entryId', description: 'GL entry identifier to reject' })
  async rejectEntry(
    @Param('entryId') entryId: string,
    @Body() body: { reason: string },
    @Headers('x-role') role: string,
    @Headers('x-email') email?: string,
  ) {
    this.logger.log(`POST /api/finstar/reject/${entryId} by ${email || role}: ${body.reason}`);
    const result = await this.finstarService.rejectEntry(entryId, role, body.reason, email);
    return { success: true, data: result };
  }

  @Post('bulk-approve')
  @Roles('admin', 'compliance_officer')
  @ApiOperation({ summary: 'Bulk approve pending GL entries', description: 'Approve multiple pending GL entries at once.' })
  async bulkApprove(
    @Body() body: { entryIds: string[] },
    @Headers('x-role') role: string,
    @Headers('x-email') email?: string,
  ) {
    this.logger.log(`POST /api/finstar/bulk-approve ${body.entryIds.length} entries by ${email || role}`);
    const result = await this.finstarService.bulkApprove(body.entryIds, role, email);
    return { success: true, data: result };
  }
}
