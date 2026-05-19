import { Controller, Get, Param, Query, Inject, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiQuery, ApiOkResponse, ApiForbiddenResponse } from '@nestjs/swagger';
import { FinstarService } from './finstar.service';
import { PrismaService } from '../prisma/prisma.service';
import { Roles } from '../auth/roles.guard';

@ApiTags('Finstar')
@Controller('finstar')
export class FinstarController {
  private readonly logger = new Logger(FinstarController.name);
  private service: FinstarService;
  private prisma: PrismaService;

  constructor(
    @Inject(FinstarService) service: FinstarService,
    @Inject(PrismaService) prisma: PrismaService,
  ) {
    this.service = service;
    this.prisma = prisma;
  }

  @Get('config')
  @Roles('admin', 'portfolio_manager', 'compliance_officer')
  @ApiOperation({ summary: 'Get Finstar config', description: 'Read the FinstarConfig PDA from the mock-finstar program.' })
  @ApiOkResponse({ description: 'Returns FinstarConfig account data.' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions. Admin, portfolio manager, or compliance officer role required.' })
  getConfig() {
    return this.service.getConfig();
  }

  @Get('ledger/:vaultId')
  @Roles('admin', 'portfolio_manager', 'compliance_officer')
  @ApiOperation({ summary: 'Get vault ledger', description: 'Aggregate GL entries for a vault: total debits, credits, running balance, and full entry list.' })
  @ApiParam({ name: 'vaultId', description: 'Vault identifier' })
  @ApiOkResponse({ description: 'Returns aggregated ledger data for the vault.' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions. Admin, portfolio manager, or compliance officer role required.' })
  getVaultLedger(@Param('vaultId') vaultId: string) {
    return this.service.getVaultLedger(vaultId);
  }

  @Get('entries/:entryId')
  @Roles('admin', 'portfolio_manager', 'compliance_officer')
  @ApiOperation({ summary: 'Get GL entry by ID', description: 'Read a single GLEntry PDA by entry ID from the mock-finstar program.' })
  @ApiParam({ name: 'entryId', description: 'GL entry identifier' })
  @ApiOkResponse({ description: 'Returns deserialized GLEntry account data.' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions. Admin, portfolio manager, or compliance officer role required.' })
  getEntry(@Param('entryId') entryId: string) {
    return this.service.getEntry(entryId);
  }

  @Get('reports/:vaultId')
  @Roles('admin', 'portfolio_manager', 'compliance_officer')
  @ApiOperation({ summary: 'Get regulatory reports for vault', description: 'Fetch all RegulatoryReport PDAs associated with a vault from the mock-finstar program.' })
  @ApiParam({ name: 'vaultId', description: 'Vault identifier' })
  @ApiOkResponse({ description: 'Returns array of RegulatoryReport account data.' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions. Admin, portfolio manager, or compliance officer role required.' })
  getRegulatoryReports(@Param('vaultId') vaultId: string) {
    return this.service.getRegulatoryReports(vaultId);
  }

  @Get('activity')
  @Roles('admin', 'portfolio_manager', 'compliance_officer')
  @ApiOperation({ summary: 'Get Finstar L1 activity log', description: 'Returns all Finstar ledger activity showing L1 core banking participation — GL entries booked, values captured, and cross-layer interactions with L2 translation layer.' })
  @ApiQuery({ name: 'vaultId', required: false, description: 'Filter by vault ID' })
  @ApiOkResponse({ description: 'Returns Finstar activity with summary metrics.' })
  async getActivity(@Query('vaultId') vaultId?: string) {
    this.logger.log(`GET /api/finstar/activity vaultId=${vaultId || 'all'}`);

    // L1 participates when TL_ACTION_EXECUTED fires (GL entry posted via CPI)
    const where: any = {
      actionType: { in: ['TL_ACTION_EXECUTED', 'DEPOSIT_RECORDED', 'ALLOCATION_EXECUTED', 'REDEMPTION_EXECUTED', 'UNWIND_EXECUTED'] },
    };
    if (vaultId) where.vaultId = vaultId;

    const events = await this.prisma.complianceEvent.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: 100,
    });

    const activity = events.map((e) => {
      let entryType = 'Unknown';
      let direction: 'credit' | 'debit' = 'credit';

      if (e.actionType === 'DEPOSIT_RECORDED') {
        entryType = 'Deposit';
        direction = 'credit';
      } else if (e.actionType === 'ALLOCATION_EXECUTED') {
        entryType = 'StrategyAllocation';
        direction = 'debit';
      } else if (e.actionType === 'REDEMPTION_EXECUTED') {
        entryType = 'Withdrawal';
        direction = 'debit';
      } else if (e.actionType === 'UNWIND_EXECUTED') {
        entryType = 'StrategyUnwind';
        direction = 'credit';
      } else if (e.actionType === 'TL_ACTION_EXECUTED') {
        entryType = 'GLBookBack';
        direction = 'credit';
      }

      return {
        id: e.id,
        eventId: e.eventId,
        vaultId: e.vaultId,
        actionType: e.actionType,
        layer: 'L1',
        layerLabel: 'Finstar Core Banking',
        entryType,
        direction,
        amount: e.amount,
        asset: e.asset || 'USDC',
        glEntryPda: e.glEntryPda,
        translationLayerRef: e.translationLayerRef,
        txSignature: e.txSignature,
        narrative: e.reason,
        status: e.glEntryPda ? 'Posted' : 'Pending',
        timestamp: e.timestamp,
      };
    });

    const totalCredits = activity.filter(a => a.direction === 'credit').reduce((sum, a) => sum + (a.amount || 0), 0);
    const totalDebits = activity.filter(a => a.direction === 'debit').reduce((sum, a) => sum + (a.amount || 0), 0);

    const summary = {
      totalEntries: activity.length,
      glEntriesPosted: activity.filter(a => a.glEntryPda).length,
      totalCredits,
      totalDebits,
      netPosition: totalCredits - totalDebits,
      deposits: activity.filter(a => a.entryType === 'Deposit').length,
      allocations: activity.filter(a => a.entryType === 'StrategyAllocation').length,
      unwinds: activity.filter(a => a.entryType === 'StrategyUnwind').length,
      bookBacks: activity.filter(a => a.entryType === 'GLBookBack').length,
    };

    return {
      success: true,
      data: { summary, activity },
    };
  }
}
