import { Controller, Get, Post, Param, Put, Body, Inject } from '@nestjs/common';
import { ProvidersService } from './providers.service';

@Controller('providers')
export class ProvidersController {
  constructor(@Inject(ProvidersService) private readonly providers: ProvidersService) {}

  @Get()
  findAll() {
    return this.providers.findAll();
  }

  @Post()
  create(@Body() body: any) {
    return this.providers.create(body);
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.providers.findById(id);
  }

  @Get(':id/monitoring')
  getMonitoring(@Param('id') id: string) {
    return this.providers.getMonitoring(id);
  }

  @Put(':id/status')
  updateStatus(@Param('id') id: string, @Body() body: { status: string }) {
    return this.providers.updateStatus(id, body.status);
  }
}
