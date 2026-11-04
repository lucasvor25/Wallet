import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected shouldSkip(): Promise<boolean> {
    // Segunda barreira: mesmo que a validação do env falhe, produção nunca pula o limite
    const disabled =
      process.env.THROTTLE_DISABLED === 'true' &&
      process.env.NODE_ENV !== 'production';
    return Promise.resolve(disabled);
  }
}
