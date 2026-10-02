import { Controller, Get, Inject, Res } from "@nestjs/common";
import { sql } from "drizzle-orm";
import type { Response } from "express";
import { PinoLogger } from "nestjs-pino";
import { DATABASE, type Database } from "../common/database/database.module.js";

/**
 * GET /api/health — liveness plus database readiness, for the reverse
 * proxy / uptime checks. Reports only "ok"/"unavailable", never error text.
 */
@Controller("health")
export class HealthController {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(HealthController.name);
  }

  @Get()
  async check(@Res({ passthrough: true }) res: Response) {
    let database: "ok" | "unavailable" = "ok";
    try {
      await this.db.execute(sql`select 1`);
    } catch (error) {
      database = "unavailable";
      this.logger.error({ err: error }, "Database health check failed");
    }
    const ok = database === "ok";
    res.status(ok ? 200 : 503);
    res.setHeader("cache-control", "no-store");
    return { status: ok ? "ok" : "degraded", checks: { database }, time: new Date().toISOString() };
  }
}
