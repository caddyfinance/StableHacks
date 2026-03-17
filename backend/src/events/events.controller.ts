import { Controller, Get, Query, Inject } from '@nestjs/common';
import { EventsService } from './events.service';

@Controller('events')
export class EventsController {
  private eventsService: EventsService;
  constructor(@Inject(EventsService) eventsService: EventsService) {
    this.eventsService = eventsService;
  }

  @Get()
  findAll(@Query('vaultId') vaultId?: string, @Query('actionType') actionType?: string) {
    return this.eventsService.findAll(vaultId, actionType);
  }
}
