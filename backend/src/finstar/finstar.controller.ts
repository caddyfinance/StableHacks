import { Controller, Get, Param, Inject } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiOkResponse, ApiForbiddenResponse } from '@nestjs/swagger';
import { FinstarService } from './finstar.service';
import { Roles } from '../auth/roles.guard';

@ApiTags('Finstar')
@Controller('finstar')
export class FinstarController {
  private service: FinstarService;

  constructor(@Inject(FinstarService) service: FinstarService) {
    this.service = service;
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
}
