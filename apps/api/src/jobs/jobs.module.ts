import { Global, Inject, Injectable, Logger, Module, type OnApplicationBootstrap, type OnApplicationShutdown } from "@nestjs/common";
import { APP_CONFIG } from "../common/config/config.module.js";
import type { AppConfig } from "../common/config/env.js";
import { InProcessJobQueue } from "./in-process-queue.js";
import { JOB_QUEUE, type JobQueue } from "./job-queue.js";
import { PgBossJobQueue } from "./pg-boss-queue.js";

/** Starts the queue once every module has defined its queues (onModuleInit), stops it gracefully. */
@Injectable()
export class JobsLifecycle implements OnApplicationBootstrap, OnApplicationShutdown {
  constructor(@Inject(JOB_QUEUE) private readonly queue: JobQueue) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.queue.start();
  }

  async onApplicationShutdown(): Promise<void> {
    await this.queue.stop();
  }
}

/**
 * The job queue (overview §3.3): pg-boss on DATABASE_URL by default, the
 * in-process driver under NODE_ENV=test (JOBS_DRIVER overrides).
 */
@Global()
@Module({
  providers: [
    {
      provide: JOB_QUEUE,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig): JobQueue => {
        if (config.jobsDriver === "inprocess") return new InProcessJobQueue();
        // Nest's Logger goes through pino (the app logger).
        const logger = new Logger("Jobs");
        return new PgBossJobQueue({ connectionString: config.databaseUrl, max: 4 }, { info: (message) => logger.log(message), error: (message) => logger.error(message) });
      },
    },
    JobsLifecycle,
  ],
  exports: [JOB_QUEUE],
})
export class JobsModule {}
