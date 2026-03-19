import { Controller, Get, Post, Param, Body, Inject, Headers } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiBody, ApiOkResponse, ApiCreatedResponse, ApiForbiddenResponse } from '@nestjs/swagger';
import { VaultsService } from './vaults.service';
import { VaultProgramService } from '../vault-program/vault-program.service';
import { Roles } from '../auth/roles.guard';

@ApiTags('Vaults')
@Controller('vaults')
export class VaultsController {
  private service: VaultsService;
  private vaultProgram: VaultProgramService;
  constructor(
    @Inject(VaultsService) service: VaultsService,
    @Inject(VaultProgramService) vaultProgram: VaultProgramService,
  ) {
    this.service = service;
    this.vaultProgram = vaultProgram;
  }

  @Get()
  @ApiOperation({ summary: 'List all vaults', description: 'Retrieve all institutional yield vaults managed on the platform. Returns vault metadata, balances, and status for each vault.' })
  @ApiOkResponse({ description: 'Returns array of all vault records.' })
  findAll() {
    return this.service.findAll();
  }

  @Get('by-wallet/:wallet')
  @ApiOperation({ summary: 'Get vaults by wallet address', description: 'Retrieve all vaults associated with a specific Solana wallet address. Used by clients to view their own vault positions.' })
  @ApiParam({ name: 'wallet', description: 'Solana wallet address of the vault owner' })
  @ApiOkResponse({ description: 'Returns vaults associated with the wallet.' })
  findByWallet(@Param('wallet') wallet: string) {
    return this.service.findByWallet(wallet);
  }

  @Post()
  @Roles('admin')
  @ApiOperation({ summary: 'Create a new vault', description: 'Create a new institutional yield vault linked to a verified credential. Requires admin role. Optionally specify a base asset (defaults to USDC).' })
  @ApiBody({ schema: { type: 'object', properties: { credentialId: { type: 'string' }, baseAsset: { type: 'string', default: 'USDC' } }, required: ['credentialId'] } })
  @ApiCreatedResponse({ description: 'Vault successfully created.' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions. Admin role required.' })
  create(@Body() body: { credentialId: string; baseAsset?: string }) {
    return this.service.create(body.credentialId, body.baseAsset);
  }

  @Get(':id/snapshot')
  @ApiOperation({ summary: 'Get vault snapshot', description: 'Retrieve a point-in-time snapshot of a vault including current balances, allocations, yield accrued, and NAV calculations.' })
  @ApiParam({ name: 'id', description: 'Vault identifier' })
  @ApiOkResponse({ description: 'Returns vault snapshot with balances and allocations.' })
  getSnapshot(@Param('id') id: string) {
    return this.service.getSnapshot(id);
  }

  @Post(':id/mandate')
  @Roles('admin')
  @ApiOperation({ summary: 'Attach investment mandate to vault', description: 'Define the investment mandate for a vault, specifying allowed/blocked strategies, allocation limits, liquidity buffers, consent thresholds, and approved destinations. Requires admin role.' })
  @ApiParam({ name: 'id', description: 'Vault identifier' })
  @ApiBody({ schema: { type: 'object', properties: { allowedStrategies: { type: 'array', items: { type: 'string' } }, blockedStrategies: { type: 'array', items: { type: 'string' } }, maxAllocationBps: { type: 'object' }, liquidityBufferBps: { type: 'number' }, consentThreshold: { type: 'number' }, leverageAllowed: { type: 'boolean' }, approvedDestinations: { type: 'array', items: { type: 'string' } } } } })
  @ApiCreatedResponse({ description: 'Mandate successfully attached to vault.' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions. Admin role required.' })
  attachMandate(@Param('id') id: string, @Body() body: {
    allowedStrategies: string[]; blockedStrategies: string[];
    maxAllocationBps: Record<string, number>; liquidityBufferBps: number;
    consentThreshold: number; leverageAllowed: boolean; approvedDestinations: string[];
  }) {
    return this.service.attachMandate(id, body);
  }

  @Get(':id/mandate')
  @ApiOperation({ summary: 'Get vault mandate', description: 'Retrieve the investment mandate attached to a vault, including strategy constraints, allocation limits, and compliance parameters.' })
  @ApiParam({ name: 'id', description: 'Vault identifier' })
  @ApiOkResponse({ description: 'Returns the vault mandate configuration.' })
  getMandate(@Param('id') id: string) {
    return this.service.getMandate(id);
  }

  @Get(':id/deposits')
  @ApiOperation({ summary: 'Get vault deposit history', description: 'Retrieve the full deposit history for a vault, including amounts, sources, timestamps, and jurisdiction tags for compliance tracking.' })
  @ApiParam({ name: 'id', description: 'Vault identifier' })
  @ApiOkResponse({ description: 'Returns array of deposit records for the vault.' })
  getDeposits(@Param('id') id: string) {
    return this.service.getDeposits(id);
  }

  @Post(':id/deposit')
  @Roles('admin', 'portfolio_manager', 'client_representative')
  @ApiOperation({ summary: 'Deposit funds into vault', description: 'Deposit funds into an institutional yield vault. Records the deposit amount, source wallet, source type, and jurisdiction tag for full audit trail and compliance.' })
  @ApiParam({ name: 'id', description: 'Vault identifier' })
  @ApiBody({ schema: { type: 'object', properties: { amount: { type: 'number' }, sourceWallet: { type: 'string' }, sourceReference: { type: 'string' }, sourceType: { type: 'string' }, jurisdictionTag: { type: 'string' } }, required: ['amount'] } })
  @ApiCreatedResponse({ description: 'Deposit successfully recorded.' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions.' })
  deposit(
    @Param('id') id: string,
    @Body() body: { amount: number; sourceWallet?: string; sourceReference?: string; sourceType?: string; jurisdictionTag?: string },
    @Headers('x-wallet') callerWallet?: string,
  ) {
    return this.service.deposit(id, body.amount, body.sourceWallet, body.sourceReference, body.sourceType, body.jurisdictionTag, callerWallet);
  }

  @Post(':id/allocate')
  @Roles('portfolio_manager')
  @ApiOperation({ summary: 'Allocate vault funds to strategy', description: 'Allocate a specified amount from the vault\'s idle balance to a yield strategy. Requires portfolio_manager role. Subject to mandate constraints and allocation limits.' })
  @ApiParam({ name: 'id', description: 'Vault identifier' })
  @ApiBody({ schema: { type: 'object', properties: { strategyId: { type: 'string' }, amount: { type: 'number' } }, required: ['strategyId', 'amount'] } })
  @ApiCreatedResponse({ description: 'Allocation successfully executed.' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions. Portfolio manager role required.' })
  allocate(@Param('id') id: string, @Body() body: { strategyId: string; amount: number }) {
    return this.service.allocate(id, body.strategyId, body.amount);
  }

  @Post(':id/redeem')
  @Roles('client_representative')
  @ApiOperation({ summary: 'Redeem funds from vault', description: 'Initiate a redemption (withdrawal) from the vault to a destination wallet. Requires client_representative role. Creates a withdrawal request that may need processing.' })
  @ApiParam({ name: 'id', description: 'Vault identifier' })
  @ApiBody({ schema: { type: 'object', properties: { amount: { type: 'number' }, destinationWallet: { type: 'string' }, txSignature: { type: 'string' } }, required: ['amount', 'destinationWallet'] } })
  @ApiCreatedResponse({ description: 'Redemption request created.' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions. Client representative role required.' })
  redeem(
    @Param('id') id: string,
    @Body() body: { amount: number; destinationWallet: string; txSignature?: string },
    @Headers('x-wallet') callerWallet?: string,
  ) {
    return this.service.redeem(id, body.amount, body.destinationWallet, callerWallet, body.txSignature);
  }

  @Post('withdrawals/:requestId/process')
  @Roles('admin', 'portfolio_manager')
  @ApiOperation({ summary: 'Process a pending withdrawal', description: 'Process and finalize a pending withdrawal request. Requires admin or portfolio_manager role. Optionally include the on-chain transaction signature for audit purposes.' })
  @ApiParam({ name: 'requestId', description: 'Withdrawal request identifier' })
  @ApiBody({ schema: { type: 'object', properties: { txSignature: { type: 'string' } } } })
  @ApiCreatedResponse({ description: 'Withdrawal successfully processed.' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions.' })
  processWithdrawal(
    @Param('requestId') requestId: string,
    @Body() body: { txSignature?: string },
  ) {
    return this.service.processWithdrawal(requestId, body.txSignature);
  }

  @Get('amina-wallet')
  @ApiOperation({ summary: 'Get AMINA bank wallet address', description: 'Retrieve the platform\'s AMINA bank Solana wallet address used for on-ramp and off-ramp operations.' })
  @ApiOkResponse({ description: 'Returns the AMINA bank wallet public key.' })
  getAminaWallet() {
    return { wallet: this.vaultProgram.getAminaBankWallet() };
  }

  @Post('onramp')
  @Roles('admin', 'portfolio_manager', 'client_representative')
  @ApiOperation({ summary: 'On-ramp fiat to crypto', description: 'Convert fiat currency to on-chain tokens and send to a recipient wallet. Used to fund vaults from traditional banking rails.' })
  @ApiBody({ schema: { type: 'object', properties: { recipientWallet: { type: 'string' }, amount: { type: 'number' } }, required: ['recipientWallet', 'amount'] } })
  @ApiCreatedResponse({ description: 'On-ramp transaction completed.' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions.' })
  async onramp(
    @Body() body: { recipientWallet: string; amount: number },
    @Headers('x-wallet') callerWallet?: string,
  ) {
    return this.service.onramp(body.recipientWallet, body.amount, callerWallet);
  }

  @Post('offramp')
  @Roles('admin', 'portfolio_manager', 'client_representative')
  @ApiOperation({ summary: 'Off-ramp crypto to fiat', description: 'Convert on-chain tokens back to fiat currency from a sender wallet. Used to withdraw funds from the platform to traditional banking rails.' })
  @ApiBody({ schema: { type: 'object', properties: { senderWallet: { type: 'string' }, amount: { type: 'number' }, txSignature: { type: 'string' } }, required: ['senderWallet', 'amount'] } })
  @ApiCreatedResponse({ description: 'Off-ramp transaction completed.' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions.' })
  async offramp(
    @Body() body: { senderWallet: string; amount: number; txSignature?: string },
    @Headers('x-wallet') callerWallet?: string,
  ) {
    return this.service.offramp(body.senderWallet, body.amount, callerWallet, body.txSignature);
  }

  @Post(':id/unwind')
  @Roles('emergency_admin')
  @ApiOperation({ summary: 'Emergency unwind strategy position', description: 'Emergency action to unwind (fully exit) a strategy position for a vault. Requires emergency_admin role. Returns allocated funds back to idle balance.' })
  @ApiParam({ name: 'id', description: 'Vault identifier' })
  @ApiBody({ schema: { type: 'object', properties: { strategyId: { type: 'string' } }, required: ['strategyId'] } })
  @ApiCreatedResponse({ description: 'Strategy position successfully unwound.' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions. Emergency admin role required.' })
  unwind(@Param('id') id: string, @Body() body: { strategyId: string }) {
    return this.service.unwind(id, body.strategyId);
  }

  @Post(':id/pause')
  @Roles('emergency_admin')
  @ApiOperation({ summary: 'Toggle vault pause state', description: 'Emergency action to pause or unpause a vault. Requires emergency_admin role. Paused vaults block deposits, withdrawals, and allocations.' })
  @ApiParam({ name: 'id', description: 'Vault identifier' })
  @ApiCreatedResponse({ description: 'Vault pause state toggled.' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions. Emergency admin role required.' })
  togglePause(@Param('id') id: string) {
    return this.service.togglePause(id);
  }

  @Post(':id/accrue-yield')
  @ApiOperation({ summary: 'Accrue yield for vault', description: 'Trigger yield accrual calculation for a vault. Computes earned yield from active strategy allocations and updates the vault\'s NAV accordingly.' })
  @ApiParam({ name: 'id', description: 'Vault identifier' })
  @ApiCreatedResponse({ description: 'Yield successfully accrued and NAV updated.' })
  accrueYield(@Param('id') id: string) {
    return this.service.accrueYield(id);
  }
}
