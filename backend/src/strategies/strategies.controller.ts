import { Controller, Get, Put, Param, Body, Inject } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiOkResponse, ApiForbiddenResponse } from '@nestjs/swagger';
import { StrategiesService } from './strategies.service';
import { Roles } from '../auth/roles.guard';

@ApiTags('Strategies')
@Controller('strategies')
export class StrategiesController {
  private service: StrategiesService;
  constructor(@Inject(StrategiesService) service: StrategiesService) {
    this.service = service;
  }

  @Get()
  @Roles('admin', 'portfolio_manager', 'compliance_officer', 'emergency_admin')
  @ApiOperation({ summary: 'List all yield strategies', description: 'Retrieve all available yield strategies on the platform, including their APY, risk tier, status, and allocation details. Used by portfolio managers to review investment options.' })
  @ApiOkResponse({ description: 'Returns array of all strategy records.' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions.' })
  findAll() {
    return this.service.findAll();
  }

  @Put(':id/disable')
  @Roles('emergency_admin')
  @ApiOperation({ summary: 'Toggle strategy disabled state', description: 'Enable or disable a yield strategy. Requires emergency_admin role. Disabled strategies cannot receive new allocations and may trigger unwind procedures.' })
  @ApiParam({ name: 'id', description: 'Strategy identifier' })
  @ApiOkResponse({ description: 'Strategy disabled state updated.' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions. Emergency admin role required.' })
  toggleDisable(@Param('id') id: string, @Body() body: { disabled: boolean }) {
    return this.service.toggleDisable(id, body.disabled);
  }
}
