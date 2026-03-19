import { Controller, Post, Get, Body, Inject } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiOkResponse, ApiCreatedResponse, ApiForbiddenResponse } from '@nestjs/swagger';
import { AdminAuthService } from './admin-auth.service';

@ApiTags('Admin Auth')
@Controller('admin-auth')
export class AdminAuthController {
  private service: AdminAuthService;

  constructor(@Inject(AdminAuthService) service: AdminAuthService) {
    this.service = service;
  }

  // Legacy password login (fallback)
  @Post('login')
  @ApiOperation({ summary: 'Admin password login', description: 'Authenticate an admin user using email and password credentials. This is a legacy fallback method for environments where Entra ID is not available.' })
  @ApiCreatedResponse({ description: 'Login successful, returns session token.' })
  @ApiForbiddenResponse({ description: 'Invalid credentials.' })
  login(@Body() body: { email: string; password: string }) {
    return this.service.login(body.email, body.password);
  }

  // Entra ID: list available identities
  @Get('entra/users')
  @ApiOperation({ summary: 'List Entra ID users', description: 'Retrieve the list of available Microsoft Entra ID identities that can authenticate with the platform.' })
  @ApiOkResponse({ description: 'Returns array of Entra ID user identities.' })
  getEntraUsers() {
    return this.service.getEntraUsers();
  }

  // Entra ID: initiate login (generates auth code)
  @Post('entra/login')
  @ApiOperation({ summary: 'Initiate Entra ID login', description: 'Begin the Microsoft Entra ID authentication flow by generating an authorization code for the specified admin email.' })
  @ApiCreatedResponse({ description: 'Returns authorization code for Entra ID callback.' })
  @ApiForbiddenResponse({ description: 'Email not found in Entra ID directory.' })
  initiateEntraLogin(@Body() body: { email: string }) {
    return this.service.initiateEntraLogin(body.email);
  }

  // Entra ID: validate callback (exchanges code for session)
  @Post('entra/callback')
  @ApiOperation({ summary: 'Validate Entra ID callback', description: 'Exchange an Entra ID authorization code for an authenticated session. Completes the Entra ID login flow.' })
  @ApiCreatedResponse({ description: 'Returns authenticated session with admin token.' })
  @ApiForbiddenResponse({ description: 'Invalid or expired authorization code.' })
  validateEntraCallback(@Body() body: { code: string }) {
    return this.service.validateEntraCallback(body.code);
  }

  @Get('users')
  @ApiOperation({ summary: 'List all admin users', description: 'Retrieve the full list of registered admin users in the institutional vault management platform.' })
  @ApiOkResponse({ description: 'Returns array of admin user records.' })
  listUsers() {
    return this.service.listUsers();
  }
}
