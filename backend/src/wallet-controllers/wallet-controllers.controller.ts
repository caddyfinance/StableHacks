import { Controller, Get, Post, Param, Body, Inject } from '@nestjs/common';
import { WalletControllersService } from './wallet-controllers.service';

@Controller('wallet-controllers')
export class WalletControllersController {
  constructor(@Inject(WalletControllersService) private readonly walletControllers: WalletControllersService) {}

  @Get()
  findAll() {
    return this.walletControllers.findAll();
  }

  @Post()
  create(@Body() body: any) {
    return this.walletControllers.create(body);
  }

  @Get(':address')
  findByAddress(@Param('address') address: string) {
    return this.walletControllers.findByAddress(address);
  }
}
