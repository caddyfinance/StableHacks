import { Module, Global } from '@nestjs/common';
import { TranslationLayerService } from './translation-layer.service';
import { TranslationLayerController } from './translation-layer.controller';

@Global()
@Module({
  providers: [TranslationLayerService],
  controllers: [TranslationLayerController],
  exports: [TranslationLayerService],
})
export class TranslationLayerModule {}
