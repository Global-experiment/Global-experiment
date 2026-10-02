import { Module, type DynamicModule } from "@nestjs/common";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { AdminSessionGuard } from "./auth/admin-session.guard.js";
import { AuthModule } from "./auth/auth.module.js";
import { CsrfOriginGuard } from "./auth/csrf-origin.guard.js";
import { ConfigModule } from "./common/config/config.module.js";
import type { AppConfig } from "./common/config/env.js";
import { DatabaseModule } from "./common/database/database.module.js";
import { AllExceptionsFilter } from "./common/errors/all-exceptions.filter.js";
import { LoggingModule } from "./common/logging/logging.module.js";
import { HealthModule } from "./health/health.module.js";

@Module({})
export class AppModule {
  static forRoot(config?: AppConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot(config),
        LoggingModule,
        DatabaseModule,
        // In-memory limiter: correct for the single API instance v0.1 runs.
        // Per-route limits (login) are tighter; see AuthController.
        ThrottlerModule.forRoot({ throttlers: [{ name: "default", ttl: 60_000, limit: 300 }] }),
        HealthModule,
        AuthModule,
      ],
      providers: [
        // Global guards run in this order.
        { provide: APP_GUARD, useClass: ThrottlerGuard },
        { provide: APP_GUARD, useExisting: CsrfOriginGuard },
        { provide: APP_GUARD, useExisting: AdminSessionGuard },
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
      ],
    };
  }
}
