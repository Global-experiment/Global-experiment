import { Global, Inject, Injectable, Module } from "@nestjs/common";
import { inArray } from "drizzle-orm";
import { PinoLogger } from "nestjs-pino";
import { APP_CONFIG } from "../common/config/config.module.js";
import type { AppConfig } from "../common/config/env.js";
import { DATABASE, type Database } from "../common/database/database.module.js";
import { SETTINGS, type SettingKey, type SettingValue } from "./settings.registry.js";
import { settings } from "./settings.schema.js";

/**
 * Typed reads of the settings table with environment fallbacks. A stored
 * value that no longer matches its declared type is ignored (the default
 * applies) and logged by key only — values are never logged.
 */
@Injectable()
export class SettingsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(SettingsService.name);
  }

  async get<Key extends SettingKey>(key: Key): Promise<SettingValue<Key>> {
    return (await this.getMany([key]))[key];
  }

  async getMany<Key extends SettingKey>(keys: readonly Key[]): Promise<{ [K in Key]: SettingValue<K> }> {
    const rows = await this.db.select({ key: settings.key, value: settings.value }).from(settings).where(inArray(settings.key, [...keys]));
    const stored = new Map(rows.map((row) => [row.key, row.value]));
    const result = {} as { [K in Key]: SettingValue<K> };
    for (const key of keys) {
      const definition = SETTINGS[key];
      const fallback = definition.envDefault(this.config) as SettingValue<Key>;
      if (!stored.has(key)) {
        result[key] = fallback;
        continue;
      }
      const parsed = definition.schema.safeParse(stored.get(key));
      if (parsed.success) result[key] = parsed.data as SettingValue<Key>;
      else {
        this.logger.warn({ settingKey: key }, "Stored setting has the wrong type; using the environment default");
        result[key] = fallback;
      }
    }
    return result;
  }
}

@Global()
@Module({ providers: [SettingsService], exports: [SettingsService] })
export class SettingsModule {}
