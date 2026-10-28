import { Module, type DynamicModule } from "@nestjs/common";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { AdminSessionGuard } from "./auth/admin-session.guard.js";
import { AccountsModule } from "./accounts/accounts.module.js";
import { PermissionGuard } from "./access-control/permission.guard.js";
import { AuthModule } from "./auth/auth.module.js";
import { CsrfOriginGuard } from "./auth/csrf-origin.guard.js";
import { ClockModule } from "./common/clock/clock.js";
import { ConfigModule } from "./common/config/config.module.js";
import type { AppConfig } from "./common/config/env.js";
import { DatabaseModule } from "./common/database/database.module.js";
import { DonationsModule } from "./donations/donations.module.js";
import { AllExceptionsFilter } from "./common/errors/all-exceptions.filter.js";
import { LoggingModule } from "./common/logging/logging.module.js";
import { ExpertiseModule } from "./expertise/expertise.module.js";
import { HealthModule } from "./health/health.module.js";
import { ImportsModule } from "./import/imports.module.js";
import { FilesModule } from "./files/files.module.js";
import { JobsModule } from "./jobs/jobs.module.js";
import { OrganizationsModule } from "./organizations/organizations.module.js";
import { PeopleModule } from "./people/people.module.js";
import { RevalidationModule } from "./revalidation/revalidation.service.js";
import { SettingsModule } from "./settings/settings.service.js";
import { AuditModule } from "./audit/audit.module.js";
import { StripeModule } from "./stripe/stripe.module.js";
import { TreasuryModule } from "./treasury/treasury.module.js";
import { ServicesModule } from "./services/services.module.js";

@Module({})
export class AppModule {
  static forRoot(config?: AppConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot(config),
        ClockModule,
        LoggingModule,
        DatabaseModule,
        SettingsModule,
        AuditModule,
        RevalidationModule,
        JobsModule,
        FilesModule,
        // In-memory limiter: correct for the single API instance v0.1 runs.
        // Per-route limits (login) are tighter; see AuthController.
        ThrottlerModule.forRoot({ throttlers: [{ name: "default", ttl: 60_000, limit: 300 }] }),
        HealthModule,
        AuthModule,
        PeopleModule,
        OrganizationsModule,
        ExpertiseModule,
        ImportsModule,
        TreasuryModule,
        StripeModule,
        DonationsModule,
        ServicesModule,
        AccountsModule,
      ],
      providers: [
        // Global guards run in this order.
        { provide: APP_GUARD, useClass: ThrottlerGuard },
        { provide: APP_GUARD, useExisting: CsrfOriginGuard },
        { provide: APP_GUARD, useExisting: AdminSessionGuard },
        // Every /api/admin handler declares its permission (access-control/requires.ts); this checks it.
        { provide: APP_GUARD, useExisting: PermissionGuard },
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
      ],
    };
  }
}
