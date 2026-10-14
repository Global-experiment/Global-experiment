import { Global, Module } from "@nestjs/common";
import { APP_CONFIG } from "../common/config/config.module.js";
import type { AppConfig } from "../common/config/env.js";
import { FILE_STORAGE, LocalDiskStorage } from "./file-storage.js";

/** The file storage adapter (FILE_STORAGE_DIR); tests replace it with a temporary directory. */
@Global()
@Module({
  providers: [{ provide: FILE_STORAGE, inject: [APP_CONFIG], useFactory: (config: AppConfig) => new LocalDiskStorage(config.fileStorageDir) }],
  exports: [FILE_STORAGE],
})
export class FilesModule {}
