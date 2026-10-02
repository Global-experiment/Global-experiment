import "reflect-metadata";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module.js";
import { configureApp, createHttpAdapter, finalizeApp } from "./bootstrap.js";
import { parseConfig } from "./common/config/env.js";

/**
 * Outside production, read the same .env.local the Next.js app uses (repo
 * root) unless apps/api has its own. Existing variables are never overridden,
 * and production relies solely on the real process environment.
 */
function loadLocalEnvFiles() {
  if (process.env.NODE_ENV === "production") return;
  for (const file of [resolve(process.cwd(), ".env.local"), resolve(process.cwd(), "../../.env.local")]) {
    if (existsSync(file)) process.loadEnvFile(file);
  }
}

async function main() {
  loadLocalEnvFiles();
  const config = parseConfig(process.env);

  const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot(config), createHttpAdapter(), {
    bufferLogs: true,
    // The JSON body parser is registered in configureApp with a size limit.
    bodyParser: false,
  });
  configureApp(app, config);
  await app.init();
  finalizeApp(app);
  await app.listen(config.port, config.host);
}

main().catch((error: unknown) => {
  // Config errors list variable names only (see EnvValidationError).
  console.error(error instanceof Error ? error.message : "API failed to start");
  process.exit(1);
});
