import { Module, Global } from '@nestjs/common';
import { TranslationLayerService } from './translation-layer.service';
import { TranslationLayerController } from './translation-layer.controller';
import { EventsModule } from '../events/events.module';

@Global()
@Module({
  imports: [EventsModule],
  providers: [TranslationLayerService],
  controllers: [TranslationLayerController],
  exports: [TranslationLayerService],
})
export class TranslationLayerModule {}
