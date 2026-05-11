import { Controller, Get, Post, Put, Param, Body, Inject, Req, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiOkResponse, ApiCreatedResponse, ApiForbiddenResponse, ApiQuery } from '@nestjs/swagger';
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
  @Roles('admin', 'portfolio_manager', 'compliance_officer', 'client_representative')
  @ApiOperation({ summary: 'List all vaults', description: 'Retrieve all institutional yield vaults managed on the platform. Returns vault metadata, balances, and status for each vault.' })
  @ApiOkResponse({ description: 'Returns array of all vault records.' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions.' })
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

  @Get('proof-of-reserves')
  @Roles('admin', 'compliance_officer')
  @ApiOperation({ summary: 'Get Proof of Reserves / Merkle transparency proof', description: 'Generates a cryptographic proof of reserves using a Merkle tree. Returns the Merkle root, total reserves, vault count, timestamp, and per-vault leaf data with proof paths. For external audit and regulatory compliance.' })
  @ApiOkResponse({ description: 'Returns Merkle root and per-vault proofs demonstrating cryptographic proof of reserves.' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions. Admin or compliance officer role required.' })
  getProofOfReserves() {
    return this.service.getProofOfReserves();
  }

  @Get('regulatory-report')
  @Roles('admin', 'compliance_officer')
  @ApiOperation({ summary: 'Generate comprehensive regulatory report', description: 'Generates a comprehensive regulatory report containing summary metrics, per-vault NAV statements, yield attribution by strategy, fund flow summary, and compliance metrics. Supports date range filtering for reporting periods.' })
  @ApiQuery({ name: 'from', required: false, description: 'Start date (ISO format). Defaults to 30 days ago.' })
  @ApiQuery({ name: 'to', required: false, description: 'End date (ISO format). Defaults to now.' })
  @ApiOkResponse({ description: 'Returns comprehensive regulatory report with all required sections.' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions. Admin or compliance officer role required.' })
  getRegulatoryReport(
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.getRegulatoryReport(from, to);
  }

  @Get('by-wallet/:wallet')
  @Roles('admin', 'portfolio_manager', 'client_representative')
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
  @Roles('admin', 'portfolio_manager', 'compliance_officer', 'client_representative')
  @ApiOperation({ summary: 'Get vault snapshot', description: 'Retrieve a point-in-time snapshot of a vault including current balances, allocations, yield accrued, and NAV calculations.' })
  @ApiParam({ name: 'id', description: 'Vault identifier' })
  @ApiOkResponse({ description: 'Returns vault snapshot with balances and allocations.' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions.' })
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
  @Roles('admin', 'portfolio_manager', 'compliance_officer', 'client_representative')
  @ApiOperation({ summary: 'Get vault mandate', description: 'Retrieve the investment mandate attached to a vault.' })
  @ApiParam({ name: 'id', description: 'Vault identifier' })
  @ApiOkResponse({ description: 'Returns the vault mandate configuration.' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions.' })
  getMandate(@Param('id') id: string) {
    return this.service.getMandate(id);
  }

  @Put(':id/mandate')
  @Roles('admin')
  @ApiOperation({ summary: 'Update vault mandate', description: 'Update an existing mandate. liquidityBufferBps cannot be set below 1000 (10%). Triggers on-chain sync automatically.' })
  @ApiParam({ name: 'id', description: 'Vault identifier' })
  @ApiOkResponse({ description: 'Mandate updated successfully.' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions. Admin role required.' })
  updateMandate(
    @Param('id') id: string,
    @Body() body: {
      allowedStrategies?: string[]; blockedStrategies?: string[];
      maxAllocationBps?: Record<string, number>; liquidityBufferBps?: number;
      consentThreshold?: number; leverageAllowed?: boolean; approvedDestinations?: string[];
    },
    @Req() req: Request,
  ) {
    const callerWallet = (req.headers as any)['x-wallet'] as string | undefined;
    const callerRole = (req.headers as any)['x-role'] as string || 'admin';
    return this.service.updateMandate(id, body, callerWallet || callerRole);
  }

  @Get(':id/mandate/rules')
  @Roles('admin', 'portfolio_manager', 'compliance_officer')
  @ApiOperation({ summary: 'Get active mandate rules', description: 'Returns the typed rule registry for this vault mandate.' })
  @ApiParam({ name: 'id', description: 'Vault identifier' })
  @ApiOkResponse({ description: 'Returns array of active MandateRule records.' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions.' })
  getMandateRules(@Param('id') id: string) {
    return this.service.getMandateRules(id);
  }

  @Get(':id/mandate/history')
  @Roles('admin')
  @ApiOperation({ summary: 'Get mandate change history', description: 'Returns all mandate rule records including superseded versions for audit trail.' })
  @ApiParam({ name: 'id', description: 'Vault identifier' })
  @ApiOkResponse({ description: 'Returns full MandateRule history.' })
  getMandateHistory(@Param('id') id: string) {
    return this.service.getMandateHistory(id);
  }

  @Get(':id/buffer-health')
  @Roles('admin', 'portfolio_manager', 'compliance_officer')
  @ApiOperation({ summary: 'Get vault buffer health', description: 'Returns live liquidity buffer metrics: required, deployable, utilization, and shortfall.' })
  @ApiParam({ name: 'id', description: 'Vault identifier' })
  @ApiOkResponse({ description: 'Returns buffer health status and metrics.' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions.' })
  getBufferHealth(@Param('id') id: string) {
    return this.service.getBufferHealth(id);
  }

  @Post(':id/mandate/sync')
  @Roles('admin')
  @ApiOperation({ summary: 'Sync mandate to chain', description: 'Push the current DB mandate to the on-chain program PDA. Sets onChainSynced = true on success.' })
  @ApiParam({ name: 'id', description: 'Vault identifier' })
  @ApiCreatedResponse({ description: 'Mandate synced to chain.' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions. Admin role required.' })
  syncMandateToChain(@Param('id') id: string, @Req() req: Request) {
    const callerWallet = (req.headers as any)['x-wallet'] as string | undefined;
    return this.service.syncMandateToChain(id, callerWallet);
  }

  @Get(':id/deposits')
  @Roles('admin', 'portfolio_manager', 'compliance_officer', 'client_representative')
  @ApiOperation({ summary: 'Get vault deposit history', description: 'Retrieve the full deposit history for a vault.' })
  @ApiParam({ name: 'id', description: 'Vault identifier' })
  @ApiOkResponse({ description: 'Returns array of deposit records for the vault.' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions.' })
  getDeposits(@Param('id') id: string) {
    return this.service.getDeposits(id);
  }

  @Post(':id/activate')
  @Roles('admin', 'client_representative')
  @ApiOperation({ summary: 'Activate vault', description: 'Client (or admin on behalf of client) approves the mandate and activates the vault. Changes status from initiated to active. Required before deposits.' })
  @ApiParam({ name: 'id', description: 'Vault identifier' })
  @ApiCreatedResponse({ description: 'Vault activated successfully.' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions. Admin or client representative role required.' })
  activate(
    @Param('id') id: string,
    @Body() body: { signature?: string; signerWallet?: string },
    @Req() req: Request,
  ) {
    const callerRole = req.headers['x-role'] as string;
    const callerWallet = callerRole === 'admin'
      ? undefined  // Admin activates on behalf of client — skip wallet ownership check
      : req.headers['x-wallet'] as string | undefined;
    return this.service.activateVault(id, callerWallet, body.signature, body.signerWallet);
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
  @Roles('admin', 'portfolio_manager', 'client_representative')
  @ApiOperation({ summary: 'Get AMINA bank wallet address', description: 'Retrieve the AMINA bank Solana wallet address for on-ramp and off-ramp operations.' })
  @ApiOkResponse({ description: 'Returns the AMINA bank wallet public key.' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions.' })
  getAminaWallet() {
    return { wallet: this.vaultProgram.getAminaBankWallet() };
  }

  @Get('amina-bank-balance')
  @Roles('admin')
  @ApiOperation({ summary: 'Get AMINA Bank USD balance', description: 'Returns the simulated AMINA Bank fiat (USD) balance available for on-ramp.' })
  @ApiOkResponse({ description: 'Returns balance and currency.' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions. Admin role required.' })
  getAminaBankBalance() {
    return this.service.getBankBalance();
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
  unwind(@Param('id') id: string, @Body() body: { strategyId: string }) {
    return this.service.unwind(id, body.strategyId);
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
  @Roles('admin', 'portfolio_manager')
  @ApiOperation({ summary: 'Accrue yield for vault', description: 'Trigger yield accrual calculation for a vault.' })
  @ApiParam({ name: 'id', description: 'Vault identifier' })
  @ApiCreatedResponse({ description: 'Yield successfully accrued and NAV updated.' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions.' })
  accrueYield(@Param('id') id: string) {
    return this.service.accrueYield(id);
  }

  @Post(':id/reconcile')
  @Roles('admin', 'portfolio_manager')
  @ApiOperation({ summary: 'Reconcile vault balance', description: 'Recompute vault idle balance from DB records (deposits - deployments - withdrawals). Fixes corrupted balances.' })
  @ApiParam({ name: 'id', description: 'Vault identifier' })
  @ApiCreatedResponse({ description: 'Vault balance reconciled successfully.' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions.' })
  reconcile(@Param('id') id: string) {
    return this.service.reconcileBalance(id);
  }

}
