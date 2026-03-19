import { Controller, Get, Post, Param, Body, Inject } from '@nestjs/common';
import { SolsticeService } from './solstice.service';
import { Roles } from '../auth/roles.guard';

@Controller('solstice')
export class SolsticeController {
  private solstice: SolsticeService;

  constructor(@Inject(SolsticeService) solstice: SolsticeService) {
    this.solstice = solstice;
  }

  @Post('lock')
  @Roles('portfolio_manager')
  lock(@Body() body: { vaultId: string; amount: number; collateral?: 'usdc' | 'usdt' }) {
    return this.solstice.lockUSX(body.vaultId, body.amount, body.collateral || 'usdc');
  }

  @Post('unlock')
  @Roles('portfolio_manager')
  unlock(@Body() body: { vaultId: string; amount: number }) {
    return this.solstice.unlockEUSX(body.vaultId, body.amount);
  }

  @Post('withdraw')
  @Roles('portfolio_manager')
  withdraw(@Body() body: { vaultId: string }) {
    return this.solstice.withdrawUSX(body.vaultId);
  }

  // ─── USX Minting ────────────────────────────────────────────

  @Post('request-mint')
  @Roles('portfolio_manager')
  requestMint(@Body() body: { amount: number; collateral?: 'usdc' | 'usdt' }) {
    return this.solstice.requestMintUSX(body.amount, body.collateral || 'usdc');
  }

  @Post('confirm-mint')
  @Roles('portfolio_manager')
  confirmMint(@Body() body: { collateral?: 'usdc' | 'usdt' }) {
    return this.solstice.confirmMintUSX(body.collateral || 'usdc');
  }

  @Post('cancel-mint')
  @Roles('portfolio_manager')
  cancelMint(@Body() body: { collateral?: 'usdc' | 'usdt' }) {
    return this.solstice.cancelMintUSX(body.collateral || 'usdc');
  }

  // ─── USX Redemption ─────────────────────────────────────────

  @Post('request-redeem')
  @Roles('portfolio_manager')
  requestRedeem(@Body() body: { amount: number; collateral?: 'usdc' | 'usdt' }) {
    return this.solstice.requestRedeemUSX(body.amount, body.collateral || 'usdc');
  }

  @Post('confirm-redeem')
  @Roles('portfolio_manager')
  confirmRedeem(@Body() body: { collateral?: 'usdc' | 'usdt' }) {
    return this.solstice.confirmRedeemUSX(body.collateral || 'usdc');
  }

  @Post('cancel-redeem')
  @Roles('portfolio_manager')
  cancelRedeem(@Body() body: { collateral?: 'usdc' | 'usdt' }) {
    return this.solstice.cancelRedeemUSX(body.collateral || 'usdc');
  }

  // ─── Read-Only ──────────────────────────────────────────────

  @Get('pool-state')
  getPoolState() {
    return this.solstice.getYieldPoolState();
  }

  @Get('position/:vaultId')
  getPosition(@Param('vaultId') vaultId: string) {
    return this.solstice.getPositionForVault(vaultId);
  }

  @Get('fund-flow/:vaultId')
  getFundFlow(@Param('vaultId') vaultId: string) {
    return this.solstice.getFundFlowHistory(vaultId);
  }

  @Post('mint-collateral')
  @Roles('portfolio_manager')
  mintCollateral(@Body() body: { amount: number; collateral?: 'usdc' | 'usdt' }) {
    return this.solstice.mintDevnetCollateral(body.amount, body.collateral || 'usdc');
  }
}
