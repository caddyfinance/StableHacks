import { Controller, Get, Post, Param, Body, Inject } from '@nestjs/common';
import { WalletControllersService } from './wallet-controllers.service';
import { Roles } from '../auth/roles.guard';

@Controller('wallet-controllers')
export class WalletControllersController {
  constructor(@Inject(WalletControllersService) private readonly walletControllers: WalletControllersService) {}

  @Get()
  @Roles('admin', 'compliance_officer', 'portfolio_manager')
  findAll() {
    return this.walletControllers.findAll();
  }

  @Post()
  @Roles('admin', 'compliance_officer')
  create(@Body() body: any) {
    return this.walletControllers.create(body);
  }

  @Post('sync')
  @Roles('admin')
  sync() {
    return this.walletControllers.syncFromExistingData();
  }

  @Get(':address')
  @Roles('admin', 'compliance_officer', 'portfolio_manager')
  findByAddress(@Param('address') address: string) {
    return this.walletControllers.findByAddress(address);
  }
}
