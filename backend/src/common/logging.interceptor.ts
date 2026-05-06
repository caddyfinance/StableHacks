import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request } from 'express';

const EXCLUDED_PATHS = ['/api/health', '/api/health/ready'];

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();
    const { method, path } = request;
    const role = (request.headers['x-role'] as string) || '-';
    const wallet = (request.headers['x-wallet'] as string) || '-';

    if (EXCLUDED_PATHS.some((p) => path.startsWith(p))) {
      return next.handle();
    }

    const startTime = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - startTime;
          const response = context.switchToHttp().getResponse();
          this.logger.log(`${method} ${path} ${response.statusCode} ${duration}ms role=${role} wallet=${wallet}`);
        },
        error: (err) => {
          const duration = Date.now() - startTime;
          this.logger.warn(`${method} ${path} ${err.status || 500} ${duration}ms role=${role} wallet=${wallet} error="${err.message}"`);
        },
      }),
    );
  }
}
