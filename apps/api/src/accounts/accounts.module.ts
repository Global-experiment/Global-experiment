import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { FilesModule } from "../files/files.module.js";
import { ServicesModule } from "../services/services.module.js";
import { AccountsController, ProfileController, TokensController } from "./accounts.controller.js";
import { AccountsRepository } from "./accounts.repository.js";
import { AccountsService } from "./accounts.service.js";

/** Admin accounts, the profile and the one-time links (admin-desktop.pdf p15, p18). */
@Module({
  imports: [AuthModule, FilesModule, ServicesModule],
  controllers: [AccountsController, ProfileController, TokensController],
  providers: [AccountsRepository, AccountsService],
})
export class AccountsModule {}
