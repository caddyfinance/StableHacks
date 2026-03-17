import { Controller, Get, Put, Param, Body, Inject } from '@nestjs/common';
import { StrategiesService } from './strategies.service';
import { Roles } from '../auth/roles.guard';

@Controller('strategies')
export class StrategiesController {
  private service: StrategiesService;
  constructor(@Inject(StrategiesService) service: StrategiesService) {
    this.service = service;
  }

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Put(':id/disable')
  @Roles('emergency_admin')
  toggleDisable(@Param('id') id: string, @Body() body: { disabled: boolean }) {
    return this.service.toggleDisable(id, body.disabled);
  }
}
