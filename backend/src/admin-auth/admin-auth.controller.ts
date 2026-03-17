import { Controller, Post, Get, Body, Inject } from '@nestjs/common';
import { AdminAuthService } from './admin-auth.service';

@Controller('admin-auth')
export class AdminAuthController {
  private service: AdminAuthService;

  constructor(@Inject(AdminAuthService) service: AdminAuthService) {
    this.service = service;
  }

  // Legacy password login (fallback)
  @Post('login')
  login(@Body() body: { email: string; password: string }) {
    return this.service.login(body.email, body.password);
  }

  // Entra ID: list available identities
  @Get('entra/users')
  getEntraUsers() {
    return this.service.getEntraUsers();
  }

  // Entra ID: initiate login (generates auth code)
  @Post('entra/login')
  initiateEntraLogin(@Body() body: { email: string }) {
    return this.service.initiateEntraLogin(body.email);
  }

  // Entra ID: validate callback (exchanges code for session)
  @Post('entra/callback')
  validateEntraCallback(@Body() body: { code: string }) {
    return this.service.validateEntraCallback(body.code);
  }

  @Get('users')
  listUsers() {
    return this.service.listUsers();
  }
}
