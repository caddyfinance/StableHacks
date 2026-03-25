import { Controller, Get, Post, Param, Body, Inject, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiOkResponse, ApiCreatedResponse, ApiForbiddenResponse } from '@nestjs/swagger';
import { Request } from 'express';
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

  @Get('transparency')
  @Roles('admin')
  @ApiOperation({ summary: 'Get transparency / fund segregation view', description: 'Returns all vaults with full deposit, allocation, and event data to prove non-commingling of client assets. Admin only.' })
  @ApiOkResponse({ description: 'Returns transparency data grouped by owner wallet.' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions. Admin role required.' })
  getTransparency() {
    return this.service.getTransparency();
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
  @ApiOperation({ summary: 'Create a new vault', description: 'Create a new institutional yield vault linked to a verified credential. Requires admin role.' })
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
  @Roles('admin', 'portfolio_manager', 'client_representative')
  @ApiOperation({ summary: 'Attach investment mandate to vault', description: 'Define the investment mandate for a vault, specifying allowed/blocked strategies, allocation limits, liquidity buffers, consent thresholds, and approved destinations.' })
  @ApiParam({ name: 'id', description: 'Vault identifier' })
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
  @ApiOperation({ summary: 'Get vault mandate', description: 'Retrieve the investment mandate attached to a vault.' })
  @ApiParam({ name: 'id', description: 'Vault identifier' })
  @ApiOkResponse({ description: 'Returns the vault mandate configuration.' })
  getMandate(@Param('id') id: string) {
    return this.service.getMandate(id);
  }

  @Get(':id/deposits')
  @ApiOperation({ summary: 'Get vault deposit history', description: 'Retrieve the full deposit history for a vault.' })
  @ApiParam({ name: 'id', description: 'Vault identifier' })
  @ApiOkResponse({ description: 'Returns array of deposit records for the vault.' })
  getDeposits(@Param('id') id: string) {
    return this.service.getDeposits(id);
  }

  @Post(':id/activate')
  @Roles('client_representative')
  @ApiOperation({ summary: 'Activate vault', description: 'Client approves the mandate and activates the vault. Changes status from initiated to active. Required before deposits.' })
  @ApiParam({ name: 'id', description: 'Vault identifier' })
  @ApiCreatedResponse({ description: 'Vault activated successfully.' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions. Client representative role required.' })
  activate(@Param('id') id: string, @Req() req: Request) {
    const callerWallet = req.headers['x-wallet'] as string | undefined;
    return this.service.activateVault(id, callerWallet);
  }

  @Post(':id/deposit')
  @Roles('admin', 'portfolio_manager', 'client_representative')
  @ApiOperation({ summary: 'Deposit funds into vault', description: 'Deposit funds into an institutional yield vault. Vault must be active.' })
  @ApiParam({ name: 'id', description: 'Vault identifier' })
  @ApiCreatedResponse({ description: 'Deposit successfully recorded.' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions.' })
  deposit(
    @Param('id') id: string,
    @Body() body: { amount: number; sourceWallet?: string; sourceReference?: string; sourceType?: string; jurisdictionTag?: string },
    @Req() req: Request,
  ) {
    const callerWallet = req.headers['x-wallet'] as string | undefined;
    return this.service.deposit(id, body.amount, body.sourceWallet, body.sourceReference, body.sourceType, body.jurisdictionTag, callerWallet);
  }

  @Post(':id/allocate')
  @Roles('portfolio_manager')
  @ApiOperation({ summary: 'Allocate vault funds to strategy', description: 'Allocate from idle balance to a yield strategy. Subject to mandate constraints.' })
  @ApiParam({ name: 'id', description: 'Vault identifier' })
  @ApiCreatedResponse({ description: 'Allocation successfully executed.' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions. Portfolio manager role required.' })
  allocate(@Param('id') id: string, @Body() body: { strategyId: string; amount: number }) {
    return this.service.allocate(id, body.strategyId, body.amount);
  }

  @Post(':id/redeem')
  @Roles('client_representative')
  @ApiOperation({ summary: 'Redeem funds from vault', description: 'Initiate a redemption (withdrawal) from the vault to a destination wallet.' })
  @ApiParam({ name: 'id', description: 'Vault identifier' })
  @ApiCreatedResponse({ description: 'Redemption request created.' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions. Client representative role required.' })
  redeem(
    @Param('id') id: string,
    @Body() body: { amount: number; destinationWallet: string; txSignature?: string },
    @Req() req: Request,
  ) {
    const callerWallet = req.headers['x-wallet'] as string | undefined;
    return this.service.redeem(id, body.amount, body.destinationWallet, callerWallet, body.txSignature);
  }

  @Post('withdrawals/:requestId/process')
  @Roles('admin', 'portfolio_manager')
  @ApiOperation({ summary: 'Process a pending withdrawal', description: 'Process and finalize a pending withdrawal request.' })
  @ApiParam({ name: 'requestId', description: 'Withdrawal request identifier' })
  @ApiCreatedResponse({ description: 'Withdrawal successfully processed.' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions.' })
  processWithdrawal(
    @Param('requestId') requestId: string,
    @Body() body: { txSignature?: string },
  ) {
    return this.service.processWithdrawal(requestId, body.txSignature);
  }

  @Get('amina-wallet')
  @ApiOperation({ summary: 'Get AMINA bank wallet address', description: 'Retrieve the AMINA bank Solana wallet address for on-ramp and off-ramp operations.' })
  @ApiOkResponse({ description: 'Returns the AMINA bank wallet public key.' })
  getAminaWallet() {
    return { wallet: this.vaultProgram.getAminaBankWallet() };
  }

  @Post('onramp')
  @Roles('admin', 'portfolio_manager', 'client_representative')
  @ApiOperation({ summary: 'On-ramp fiat to crypto', description: 'Convert fiat to on-chain tokens and send to a recipient wallet.' })
  @ApiCreatedResponse({ description: 'On-ramp transaction completed.' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions.' })
  async onramp(
    @Body() body: { recipientWallet: string; amount: number },
    @Req() req: Request,
  ) {
    const callerWallet = req.headers['x-wallet'] as string | undefined;
    return this.service.onramp(body.recipientWallet, body.amount, callerWallet);
  }

  @Post('offramp')
  @Roles('admin', 'portfolio_manager', 'client_representative')
  @ApiOperation({ summary: 'Off-ramp crypto to fiat', description: 'Convert on-chain tokens back to fiat from a sender wallet.' })
  @ApiCreatedResponse({ description: 'Off-ramp transaction completed.' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions.' })
  async offramp(
    @Body() body: { senderWallet: string; amount: number; txSignature?: string },
    @Req() req: Request,
  ) {
    const callerWallet = req.headers['x-wallet'] as string | undefined;
    return this.service.offramp(body.senderWallet, body.amount, callerWallet, body.txSignature);
  }

  @Post(':id/unwind')
  @Roles('emergency_admin', 'portfolio_manager')
  @ApiOperation({ summary: 'Unwind strategy position', description: 'Exit a strategy position and return funds to idle balance.' })
  @ApiParam({ name: 'id', description: 'Vault identifier' })
  @ApiCreatedResponse({ description: 'Strategy position successfully unwound.' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions. Emergency admin role required.' })
  unwind(@Param('id') id: string, @Body() body: { strategyId: string; amount?: number }) {
    return this.service.unwind(id, body.strategyId, body.amount);
  }

  @Post(':id/pause')
  @Roles('emergency_admin')
  @ApiOperation({ summary: 'Toggle vault pause state', description: 'Pause or unpause a vault. Paused vaults block deposits, withdrawals, and allocations.' })
  @ApiParam({ name: 'id', description: 'Vault identifier' })
  @ApiCreatedResponse({ description: 'Vault pause state toggled.' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions. Emergency admin role required.' })
  togglePause(@Param('id') id: string) {
    return this.service.togglePause(id);
  }

  @Post(':id/accrue-yield')
  @ApiOperation({ summary: 'Accrue yield for vault', description: 'Trigger yield accrual calculation for a vault.' })
  @ApiParam({ name: 'id', description: 'Vault identifier' })
  @ApiCreatedResponse({ description: 'Yield successfully accrued and NAV updated.' })
  accrueYield(@Param('id') id: string) {
    return this.service.accrueYield(id);
  }

}
