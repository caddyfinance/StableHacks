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
  lock(@Body() body: { vaultId: string; amount: number }) {
    return this.solstice.lockUSX(body.vaultId, body.amount);
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

  @Post('mint-usdc')
  @Roles('portfolio_manager')
  mintUSDC(@Body() body: { amount: number }) {
    return this.solstice.mintDevnetUSDC(body.amount);
  }

  @Post('deposit-usdc-for-usx')
  @Roles('portfolio_manager')
  depositUSDCForUSX(@Body() body: { amount: number }) {
    return this.solstice.depositUSDCForUSX(body.amount);
  }
}
