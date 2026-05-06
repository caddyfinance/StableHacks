import { Controller, Get, Query, Inject } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiOkResponse, ApiForbiddenResponse } from '@nestjs/swagger';
import { EventsService } from './events.service';
import { Roles } from '../auth/roles.guard';

@ApiTags('Events')
@Controller('events')
export class EventsController {
  private eventsService: EventsService;
  constructor(@Inject(EventsService) eventsService: EventsService) {
    this.eventsService = eventsService;
  }

  @Get()
  @Roles('admin', 'portfolio_manager', 'compliance_officer', 'client_representative')
  @ApiOperation({ summary: 'List audit events', description: 'Retrieve the audit event log for the platform. Optionally filter by vault ID and/or action type. Returns a chronological record of all vault operations for compliance and reporting.' })
  @ApiOkResponse({ description: 'Returns array of audit event records, optionally filtered.' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions.' })
  findAll(@Query('vaultId') vaultId?: string, @Query('actionType') actionType?: string) {
    return this.eventsService.findAll(vaultId, actionType);
  }
}
