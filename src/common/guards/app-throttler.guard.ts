import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
    protected shouldSkip(): Promise<boolean> {
        return Promise.resolve(process.env.THROTTLE_DISABLED === 'true');
    }
}