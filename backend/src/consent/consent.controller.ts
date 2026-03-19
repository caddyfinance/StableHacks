import { Controller, Get, Put, Param, Inject } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiOkResponse, ApiForbiddenResponse } from '@nestjs/swagger';
import { ConsentService } from './consent.service';
import { Roles } from '../auth/roles.guard';

@ApiTags('Consent')
@Controller('consent')
export class ConsentController {
  private service: ConsentService;
  constructor(@Inject(ConsentService) service: ConsentService) {
    this.service = service;
  }

  @Get()
  @ApiOperation({ summary: 'List all consent requests', description: 'Retrieve all pending and resolved consent requests. Consent requests are generated when vault operations exceed mandate thresholds and require client approval.' })
  @ApiOkResponse({ description: 'Returns array of all consent request records.' })
  findAll() {
    return this.service.findAll();
  }

  @Put(':id/approve')
  @Roles('client_representative')
  @ApiOperation({ summary: 'Approve a consent request', description: 'Approve a pending consent request by ID. Requires client_representative role. Once approved, the associated vault operation (e.g., large allocation) can proceed.' })
  @ApiParam({ name: 'id', description: 'Consent request identifier' })
  @ApiOkResponse({ description: 'Consent request approved successfully.' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions. Client representative role required.' })
  approve(@Param('id') id: string) {
    return this.service.approve(id);
  }
}
