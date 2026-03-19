import { Global, Module, OnModuleInit } from '@nestjs/common';
import { SolsticeService } from './solstice.service';
import { SolsticeController } from './solstice.controller';

@Global()
@Module({
  providers: [SolsticeService],
  controllers: [SolsticeController],
  exports: [SolsticeService],
})
export class SolsticeModule implements OnModuleInit {
  constructor(private readonly solstice: SolsticeService) {}

  async onModuleInit() {
    try {
      await this.solstice.seedStrategy();
    } catch (error: any) {
      // Non-fatal: strategy seeding can fail if DB is not ready
      console.warn('Solstice strategy seeding skipped:', error.message);
    }
  }
}
