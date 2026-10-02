import { Global, Module, type DynamicModule } from "@nestjs/common";
import { parseConfig, type AppConfig } from "./env.js";

export const APP_CONFIG = Symbol("APP_CONFIG");

/** Validated, frozen configuration, injected with `@Inject(APP_CONFIG)`. */
@Global()
@Module({})
export class ConfigModule {
  static forRoot(config: AppConfig = parseConfig(process.env)): DynamicModule {
    return {
      module: ConfigModule,
      providers: [{ provide: APP_CONFIG, useValue: Object.freeze(config) }],
      exports: [APP_CONFIG],
    };
  }
}
