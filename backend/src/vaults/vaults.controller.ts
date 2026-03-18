import { Controller, Get, Post, Param, Body, Inject, Headers } from '@nestjs/common';
import { VaultsService } from './vaults.service';
import { VaultProgramService } from '../vault-program/vault-program.service';
import { Roles } from '../auth/roles.guard';

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
  findAll() {
    return this.service.findAll();
  }

  @Get('by-wallet/:wallet')
  findByWallet(@Param('wallet') wallet: string) {
    return this.service.findByWallet(wallet);
  }

  @Post()
  @Roles('admin')
  create(@Body() body: { credentialId: string; baseAsset?: string }) {
    return this.service.create(body.credentialId, body.baseAsset);
  }

  @Get(':id/snapshot')
  getSnapshot(@Param('id') id: string) {
    return this.service.getSnapshot(id);
  }

  @Post(':id/mandate')
  @Roles('admin')
  attachMandate(@Param('id') id: string, @Body() body: {
    allowedStrategies: string[]; blockedStrategies: string[];
    maxAllocationBps: Record<string, number>; liquidityBufferBps: number;
    consentThreshold: number; leverageAllowed: boolean; approvedDestinations: string[];
  }) {
    return this.service.attachMandate(id, body);
  }

  @Get(':id/mandate')
  getMandate(@Param('id') id: string) {
    return this.service.getMandate(id);
  }

  @Get(':id/deposits')
  getDeposits(@Param('id') id: string) {
    return this.service.getDeposits(id);
  }

  @Post(':id/deposit')
  @Roles('admin', 'portfolio_manager', 'client_representative')
  deposit(
    @Param('id') id: string,
    @Body() body: { amount: number; sourceWallet?: string; sourceReference?: string; sourceType?: string; jurisdictionTag?: string },
    @Headers('x-wallet') callerWallet?: string,
  ) {
    return this.service.deposit(id, body.amount, body.sourceWallet, body.sourceReference, body.sourceType, body.jurisdictionTag, callerWallet);
  }

  @Post(':id/allocate')
  @Roles('portfolio_manager')
  allocate(@Param('id') id: string, @Body() body: { strategyId: string; amount: number }) {
    return this.service.allocate(id, body.strategyId, body.amount);
  }

  @Post(':id/redeem')
  @Roles('client_representative')
  redeem(
    @Param('id') id: string,
    @Body() body: { amount: number; destinationWallet: string; txSignature?: string },
    @Headers('x-wallet') callerWallet?: string,
  ) {
    return this.service.redeem(id, body.amount, body.destinationWallet, callerWallet, body.txSignature);
  }

  @Post('withdrawals/:requestId/process')
  @Roles('admin', 'portfolio_manager')
  processWithdrawal(
    @Param('requestId') requestId: string,
    @Body() body: { txSignature?: string },
  ) {
    return this.service.processWithdrawal(requestId, body.txSignature);
  }

  @Get('amina-wallet')
  getAminaWallet() {
    return { wallet: this.vaultProgram.getAminaBankWallet() };
  }

  @Post('onramp')
  @Roles('admin', 'portfolio_manager', 'client_representative')
  async onramp(
    @Body() body: { recipientWallet: string; amount: number },
    @Headers('x-wallet') callerWallet?: string,
  ) {
    return this.service.onramp(body.recipientWallet, body.amount, callerWallet);
  }

  @Post('offramp')
  @Roles('admin', 'portfolio_manager', 'client_representative')
  async offramp(
    @Body() body: { senderWallet: string; amount: number; txSignature?: string },
    @Headers('x-wallet') callerWallet?: string,
  ) {
    return this.service.offramp(body.senderWallet, body.amount, callerWallet, body.txSignature);
  }

  @Post(':id/unwind')
  @Roles('emergency_admin')
  unwind(@Param('id') id: string, @Body() body: { strategyId: string }) {
    return this.service.unwind(id, body.strategyId);
  }

  @Post(':id/pause')
  @Roles('emergency_admin')
  togglePause(@Param('id') id: string) {
    return this.service.togglePause(id);
  }

  @Post(':id/accrue-yield')
  accrueYield(@Param('id') id: string) {
    return this.service.accrueYield(id);
  }
}
