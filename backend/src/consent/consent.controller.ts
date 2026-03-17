import { Controller, Get, Put, Param, Inject } from '@nestjs/common';
import { ConsentService } from './consent.service';
import { Roles } from '../auth/roles.guard';

@Controller('consent')
export class ConsentController {
  private service: ConsentService;
  constructor(@Inject(ConsentService) service: ConsentService) {
    this.service = service;
  }

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Put(':id/approve')
  @Roles('client_representative')
  approve(@Param('id') id: string) {
    return this.service.approve(id);
  }
}
