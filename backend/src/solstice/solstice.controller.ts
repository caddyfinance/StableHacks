import { Controller, Get, Post, Param, Body, Inject } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiOkResponse, ApiCreatedResponse, ApiForbiddenResponse } from '@nestjs/swagger';
import { SolsticeService } from './solstice.service';
import { EventsService } from '../events/events.service';
import { Roles } from '../auth/roles.guard';

@ApiTags('Solstice')
@Controller('solstice')
export class SolsticeController {
  private solstice: SolsticeService;
  private events: EventsService;

  constructor(
    @Inject(SolsticeService) solstice: SolsticeService,
    @Inject(EventsService) events: EventsService,
  ) {
    this.solstice = solstice;
    this.events = events;
  }

  @Post('lock')
  @Roles('portfolio_manager')
  @ApiOperation({ summary: 'Lock USX into yield pool', description: 'Lock USX tokens from a vault into the Solstice yield pool to earn yield. Requires portfolio_manager role. Optionally specify collateral type (USDC or USDT).' })
  @ApiCreatedResponse({ description: 'USX successfully locked into yield pool.' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions. Portfolio manager role required.' })
  lock(@Body() body: { vaultId: string; amount: number; collateral?: 'usdc' | 'usdt' }) {
    return this.solstice.lockUSX(body.vaultId, body.amount, body.collateral || 'usdc');
  }

  @Post('unlock')
  @Roles('portfolio_manager')
  @ApiOperation({ summary: 'Unlock eUSX from yield pool', description: 'Unlock eUSX tokens from the Solstice yield pool back to the vault. Requires portfolio_manager role. Converts yield-bearing eUSX back to USX.' })
  @ApiCreatedResponse({ description: 'eUSX successfully unlocked from yield pool.' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions. Portfolio manager role required.' })
  unlock(@Body() body: { vaultId: string; amount: number }) {
    return this.solstice.unlockEUSX(body.vaultId, body.amount);
  }

  @Post('withdraw')
  @Roles('portfolio_manager')
  @ApiOperation({ summary: 'Withdraw USX from Solstice', description: 'Withdraw unlocked USX tokens from Solstice back to the vault\'s idle balance. Requires portfolio_manager role. Must be called after unlocking eUSX.' })
  @ApiCreatedResponse({ description: 'USX successfully withdrawn from Solstice.' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions. Portfolio manager role required.' })
  withdraw(@Body() body: { vaultId: string }) {
    return this.solstice.withdrawUSX(body.vaultId);
  }

  // ─── USX Minting ────────────────────────────────────────────

  @Post('request-mint')
  @Roles('portfolio_manager')
  @ApiOperation({ summary: 'Request USX mint', description: 'Initiate a request to mint USX stablecoins using collateral (USDC or USDT). Requires portfolio_manager role. The mint must be confirmed or cancelled in a subsequent step.' })
  @ApiCreatedResponse({ description: 'Mint request created successfully.' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions. Portfolio manager role required.' })
  async requestMint(@Body() body: { amount: number; collateral?: 'usdc' | 'usdt' }) {
    const collateral = body.collateral || 'usdc';
    const result = await this.solstice.requestMintUSX(body.amount, collateral);

    await this.events.emit({
      actionType: 'USX_MINT_REQUESTED',
      actor: 'portfolio_manager',
      role: 'Portfolio Manager',
      asset: collateral.toUpperCase(),
      amount: body.amount,
      strategy: 'solstice-eusx-yield',
      result: 'success',
      reason: `Standalone USX mint requested: ${body.amount} ${collateral.toUpperCase()} collateral submitted`,
      txSignature: result.txSignature,
    });

    return result;
  }

  @Post('confirm-mint')
  @Roles('portfolio_manager')
  @ApiOperation({ summary: 'Confirm USX mint', description: 'Confirm a pending USX mint request, finalizing the minting of USX tokens against the deposited collateral. Requires portfolio_manager role.' })
  @ApiCreatedResponse({ description: 'Mint confirmed and USX tokens minted.' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions. Portfolio manager role required.' })
  async confirmMint(@Body() body: { collateral?: 'usdc' | 'usdt' }) {
    const collateral = body.collateral || 'usdc';
    const result = await this.solstice.confirmMintUSX(collateral);

    await this.events.emit({
      actionType: 'USX_MINT_CONFIRMED',
      actor: 'portfolio_manager',
      role: 'Portfolio Manager',
      asset: 'USX',
      strategy: 'solstice-eusx-yield',
      result: 'success',
      reason: `USX mint confirmed: collateral=${collateral.toUpperCase()}`,
      txSignature: result.txSignature,
    });

    return result;
  }

  @Post('cancel-mint')
  @Roles('portfolio_manager')
  @ApiOperation({ summary: 'Cancel USX mint request', description: 'Cancel a pending USX mint request and return the collateral. Requires portfolio_manager role.' })
  @ApiCreatedResponse({ description: 'Mint request cancelled and collateral returned.' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions. Portfolio manager role required.' })
  async cancelMint(@Body() body: { collateral?: 'usdc' | 'usdt' }) {
    const collateral = body.collateral || 'usdc';
    const result = await this.solstice.cancelMintUSX(collateral);

    await this.events.emit({
      actionType: 'USX_MINT_CANCELLED',
      actor: 'portfolio_manager',
      role: 'Portfolio Manager',
      asset: collateral.toUpperCase(),
      strategy: 'solstice-eusx-yield',
      result: 'success',
      reason: `USX mint cancelled: collateral=${collateral.toUpperCase()} returned`,
      txSignature: result.txSignature,
    });

    return result;
  }

  // ─── USX Redemption ─────────────────────────────────────────

  @Post('request-redeem')
  @Roles('portfolio_manager')
  @ApiOperation({ summary: 'Request USX redemption', description: 'Initiate a request to redeem USX stablecoins back to collateral (USDC or USDT). Requires portfolio_manager role. The redemption must be confirmed or cancelled in a subsequent step.' })
  @ApiCreatedResponse({ description: 'Redemption request created successfully.' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions. Portfolio manager role required.' })
  async requestRedeem(@Body() body: { amount: number; collateral?: 'usdc' | 'usdt' }) {
    const collateral = body.collateral || 'usdc';
    const result = await this.solstice.requestRedeemUSX(body.amount, collateral);

    await this.events.emit({
      actionType: 'USX_REDEEM_REQUESTED',
      actor: 'portfolio_manager',
      role: 'Portfolio Manager',
      asset: 'USX',
      amount: body.amount,
      strategy: 'solstice-eusx-yield',
      result: 'success',
      reason: `USX redemption requested: ${body.amount} USX -> ${collateral.toUpperCase()}`,
      txSignature: result.txSignature,
    });

    return result;
  }

  @Post('confirm-redeem')
  @Roles('portfolio_manager')
  @ApiOperation({ summary: 'Confirm USX redemption', description: 'Confirm a pending USX redemption request, finalizing the conversion of USX back to collateral tokens. Requires portfolio_manager role.' })
  @ApiCreatedResponse({ description: 'Redemption confirmed and collateral released.' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions. Portfolio manager role required.' })
  async confirmRedeem(@Body() body: { collateral?: 'usdc' | 'usdt' }) {
    const collateral = body.collateral || 'usdc';
    const result = await this.solstice.confirmRedeemUSX(collateral);

    await this.events.emit({
      actionType: 'USX_REDEEM_CONFIRMED',
      actor: 'portfolio_manager',
      role: 'Portfolio Manager',
      asset: collateral.toUpperCase(),
      strategy: 'solstice-eusx-yield',
      result: 'success',
      reason: `USX redemption confirmed: ${collateral.toUpperCase()} collateral released`,
      txSignature: result.txSignature,
    });

    return result;
  }

  @Post('cancel-redeem')
  @Roles('portfolio_manager')
  @ApiOperation({ summary: 'Cancel USX redemption request', description: 'Cancel a pending USX redemption request and retain the USX tokens. Requires portfolio_manager role.' })
  @ApiCreatedResponse({ description: 'Redemption request cancelled.' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions. Portfolio manager role required.' })
  async cancelRedeem(@Body() body: { collateral?: 'usdc' | 'usdt' }) {
    const collateral = body.collateral || 'usdc';
    const result = await this.solstice.cancelRedeemUSX(collateral);

    await this.events.emit({
      actionType: 'USX_REDEEM_CANCELLED',
      actor: 'portfolio_manager',
      role: 'Portfolio Manager',
      asset: 'USX',
      strategy: 'solstice-eusx-yield',
      result: 'success',
      reason: `USX redemption cancelled: USX tokens retained`,
      txSignature: result.txSignature,
    });

    return result;
  }

  // ─── Read-Only ──────────────────────────────────────────────

  @Get('pool-state')
  @Roles('admin', 'portfolio_manager')
  @ApiOperation({ summary: 'Get Solstice yield pool state', description: 'Retrieve the current state of the Solstice yield pool including total locked value, current APY, and pool utilization metrics.' })
  @ApiOkResponse({ description: 'Returns the current yield pool state.' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions.' })
  getPoolState() {
    return this.solstice.getYieldPoolState();
  }

  @Get('position/:vaultId')
  @Roles('admin', 'portfolio_manager', 'client_representative')
  @ApiOperation({ summary: 'Get vault Solstice position', description: 'Retrieve the current Solstice yield pool position for a specific vault, including locked USX amount, eUSX balance, and accrued yield.' })
  @ApiParam({ name: 'vaultId', description: 'Vault identifier to query position for' })
  @ApiOkResponse({ description: 'Returns the vault position in the Solstice yield pool.' })
  getPosition(@Param('vaultId') vaultId: string) {
    return this.solstice.getPositionForVault(vaultId);
  }

  @Get('fund-flow/:vaultId')
  @Roles('admin', 'portfolio_manager', 'compliance_officer')
  @ApiOperation({ summary: 'Get vault fund flow history', description: 'Retrieve the chronological fund flow history for a vault in the Solstice protocol, including all lock, unlock, mint, and redeem operations.' })
  @ApiParam({ name: 'vaultId', description: 'Vault identifier to query fund flow for' })
  @ApiOkResponse({ description: 'Returns the fund flow history for the vault.' })
  getFundFlow(@Param('vaultId') vaultId: string) {
    return this.solstice.getFundFlowHistory(vaultId);
  }

  @Post('mint-collateral')
  @Roles('portfolio_manager')
  @ApiOperation({ summary: 'Mint devnet collateral tokens', description: 'Mint test collateral tokens (USDC or USDT) on devnet for development and testing purposes. Requires portfolio_manager role. Not available on mainnet.' })
  @ApiCreatedResponse({ description: 'Devnet collateral tokens minted successfully.' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions. Portfolio manager role required.' })
  async mintCollateral(@Body() body: { amount: number; collateral?: 'usdc' | 'usdt' }) {
    const collateral = body.collateral || 'usdc';
    const result = await this.solstice.mintDevnetCollateral(body.amount, collateral);

    await this.events.emit({
      actionType: 'DEVNET_COLLATERAL_MINTED',
      actor: 'portfolio_manager',
      role: 'Portfolio Manager',
      asset: collateral.toUpperCase(),
      amount: body.amount,
      strategy: 'solstice-eusx-yield',
      result: 'success',
      reason: `Devnet ${collateral.toUpperCase()} minted: ${body.amount} tokens`,
      txSignature: result.txSignature,
    });

    return result;
  }
}
