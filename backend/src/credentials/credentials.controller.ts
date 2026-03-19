import { Controller, Get, Post, Put, Param, Body, Inject } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiBody, ApiOkResponse, ApiCreatedResponse, ApiForbiddenResponse } from '@nestjs/swagger';
import { CredentialsService } from './credentials.service';
import { Roles } from '../auth/roles.guard';

@ApiTags('Credentials')
@Controller('credentials')
export class CredentialsController {
  private service: CredentialsService;

  constructor(@Inject(CredentialsService) service: CredentialsService) {
    this.service = service;
  }

  @Get()
  @ApiOperation({ summary: 'List all credentials', description: 'Retrieve all issued verifiable credentials across the institutional vault platform. Returns KYC/AML credential records for all clients.' })
  @ApiOkResponse({ description: 'Returns array of all credential records.' })
  findAll() {
    return this.service.findAll();
  }

  @Get('wallet/:address')
  @ApiOperation({ summary: 'Get credentials by wallet address', description: 'Look up verifiable credentials associated with a specific Solana wallet address. Used to verify a client\'s compliance status before vault operations.' })
  @ApiParam({ name: 'address', description: 'Solana wallet address to look up credentials for' })
  @ApiOkResponse({ description: 'Returns credentials bound to the specified wallet.' })
  findByWallet(@Param('address') address: string) {
    return this.service.findByWallet(address);
  }

  @Get('lookup/:clientReference')
  @ApiOperation({ summary: 'Verify credential by client reference', description: 'Look up and verify a credential using the client reference identifier. Used for cross-referencing client identity with external systems.' })
  @ApiParam({ name: 'clientReference', description: 'Unique client reference identifier' })
  @ApiOkResponse({ description: 'Returns the credential matching the client reference.' })
  verifyByReference(@Param('clientReference') clientReference: string) {
    return this.service.verifyByReference(clientReference);
  }

  @Put('bind-wallet')
  @ApiOperation({ summary: 'Bind wallet to credential', description: 'Associate a Solana wallet address with an existing verifiable credential. This links on-chain identity to the off-chain KYC/AML credential.' })
  @ApiBody({ schema: { type: 'object', properties: { credentialId: { type: 'string' }, walletAddress: { type: 'string' } }, required: ['credentialId', 'walletAddress'] } })
  @ApiOkResponse({ description: 'Wallet successfully bound to the credential.' })
  bindWallet(@Body() body: { credentialId: string; walletAddress: string }) {
    return this.service.bindWallet(body.credentialId, body.walletAddress);
  }

  @Get('verify-onchain/:walletAddress')
  @ApiOperation({ summary: 'Verify on-chain credential status', description: 'Check the on-chain verification status of a credential associated with the given wallet address. Validates that the credential is recorded and active on the Solana blockchain.' })
  @ApiParam({ name: 'walletAddress', description: 'Solana wallet address to verify on-chain' })
  @ApiOkResponse({ description: 'Returns on-chain verification result.' })
  verifyOnChain(@Param('walletAddress') walletAddress: string) {
    return this.service.verifyOnChain(walletAddress);
  }

  @Get(':id/validate')
  @ApiOperation({ summary: 'Validate credential by ID', description: 'Check whether a specific credential is currently valid, including expiration and revocation status. Used as a gate before permitting vault operations.' })
  @ApiParam({ name: 'id', description: 'Credential identifier' })
  @ApiOkResponse({ description: 'Returns validation result (valid/invalid) with reason.' })
  validate(@Param('id') id: string) {
    return this.service.isCredentialValid(id);
  }

  @Post()
  @Roles('admin')
  @ApiOperation({ summary: 'Issue a new credential', description: 'Issue a new verifiable credential for a client. Requires admin role. Captures KYC/AML data including jurisdiction, risk tier, and product eligibility for institutional compliance.' })
  @ApiBody({ schema: { type: 'object', properties: { clientReference: { type: 'string' }, jurisdiction: { type: 'string' }, riskTier: { type: 'string' }, productEligibility: { type: 'string' }, walletAddress: { type: 'string' } }, required: ['clientReference', 'jurisdiction', 'riskTier', 'productEligibility', 'walletAddress'] } })
  @ApiCreatedResponse({ description: 'Credential successfully issued.' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions. Admin role required.' })
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
  @ApiOperation({ summary: 'Revoke a credential', description: 'Revoke an existing verifiable credential by ID. Requires admin role. Revoked credentials will fail validation checks and block further vault operations for the associated client.' })
  @ApiParam({ name: 'id', description: 'Credential identifier to revoke' })
  @ApiOkResponse({ description: 'Credential successfully revoked.' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions. Admin role required.' })
  revoke(@Param('id') id: string) {
    return this.service.revoke(id);
  }
}
