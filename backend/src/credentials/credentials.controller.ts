import { Controller, Get, Post, Put, Param, Body, Inject } from '@nestjs/common';
import { CredentialsService } from './credentials.service';
import { Roles } from '../auth/roles.guard';

@Controller('credentials')
export class CredentialsController {
  private service: CredentialsService;

  constructor(@Inject(CredentialsService) service: CredentialsService) {
    this.service = service;
  }

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get('wallet/:address')
  findByWallet(@Param('address') address: string) {
    return this.service.findByWallet(address);
  }

  @Get('lookup/:clientReference')
  verifyByReference(@Param('clientReference') clientReference: string) {
    return this.service.verifyByReference(clientReference);
  }

  @Put('bind-wallet')
  bindWallet(@Body() body: { credentialId: string; walletAddress: string }) {
    return this.service.bindWallet(body.credentialId, body.walletAddress);
  }

  @Get('verify-onchain/:walletAddress')
  verifyOnChain(@Param('walletAddress') walletAddress: string) {
    return this.service.verifyOnChain(walletAddress);
  }

  @Get(':id/validate')
  validate(@Param('id') id: string) {
    return this.service.isCredentialValid(id);
  }

  @Post()
  @Roles('admin')
  issue(
    @Body()
    body: {
      clientReference: string;
      jurisdiction: string;
      riskTier: string;
      productEligibility: string;
      walletAddress: string;
    },
  ) {
    return this.service.issue(body);
  }

  @Put(':id/revoke')
  @Roles('admin')
  revoke(@Param('id') id: string) {
    return this.service.revoke(id);
  }
}
