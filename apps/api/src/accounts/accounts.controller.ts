import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UploadedFile as UploadedFileParam,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Throttle } from "@nestjs/throttler";
import type { Response } from "express";
import { z } from "zod";
import { Requires, SignedIn } from "../access-control/requires.js";
import { AllowAnonymous, type AdminRequest } from "../auth/admin-area.js";
import { LOGIN_LIMIT } from "../auth/auth.controller.js";
import { AuthService } from "../auth/auth.service.js";
import { sessionCookieName, sessionCookieOptions } from "../auth/session-cookie.js";
import { APP_CONFIG } from "../common/config/config.module.js";
import type { AppConfig } from "../common/config/env.js";
import { UnauthenticatedError } from "../common/errors/api-error.js";
import { ZodValidationPipe } from "../common/validation/zod-validation.pipe.js";
import {
  AcceptTokenRequest,
  AccountsListQuery,
  ChangeEmailRequest,
  ChangePasswordRequest,
  DeactivateSelfRequest,
  InspectTokenRequest,
  ProfileRequest,
  SignUpRequest,
  UpdateAccountRequest,
} from "./accounts.contracts.js";
import { AccountsService, PICTURE_MAX_BYTES } from "./accounts.service.js";

const IdParam = new ZodValidationPipe(z.uuid("Invalid id."));
const principal = (request: AdminRequest) => {
  if (!request.admin) throw new UnauthenticatedError();
  return request.admin;
};
/** One-time links answer no-store: never cached by a browser or proxy. */
const noStore = (response: Response) => response.set("Cache-Control", "no-store");

/**
 * /api/admin/accounts — admin accounts (admin-desktop.pdf p15). Reading
 * them is accounts.read; changing and deactivating accounts and issuing
 * links is accounts.manage (the Rootadmin, overview §3.1). Accounts are made
 * by their holders from an invitation link (OPS-141): there is no "create".
 */
@Controller("admin/accounts")
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Get()
  @Requires("accounts.read")
  list(@Query(new ZodValidationPipe(AccountsListQuery)) query: AccountsListQuery) {
    return this.accounts.list(query);
  }

  @Get(":id")
  @Requires("accounts.read")
  get(@Param("id", IdParam) id: string) {
    return this.accounts.get(id);
  }

  /** Any signed-in admin may see another admin's picture (user cards, history); revalidated, as it can change under the same URL. */
  @Get(":id/picture")
  @SignedIn()
  async picture(@Param("id", IdParam) id: string, @Res({ passthrough: true }) response: Response) {
    const picture = await this.accounts.picture(id);
    response.set({
      "Content-Type": picture.type,
      "Content-Length": String(picture.bytes.length),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-cache",
    });
    return new StreamableFile(picture.bytes);
  }

  @Patch(":id")
  @Requires("accounts.manage")
  update(@Param("id", IdParam) id: string, @Body(new ZodValidationPipe(UpdateAccountRequest)) body: UpdateAccountRequest, @Req() request: AdminRequest) {
    return this.accounts.update(id, body, principal(request));
  }

  /** A new invitation link (invited account) or password reset link (active account). */
  @Post(":id/link")
  @Requires("accounts.manage")
  link(@Param("id", IdParam) id: string, @Req() request: AdminRequest, @Res({ passthrough: true }) response: Response) {
    noStore(response);
    return this.accounts.createLink(id, principal(request));
  }

  @Post(":id/deactivate")
  @HttpCode(200)
  @Requires("accounts.manage")
  deactivate(@Param("id", IdParam) id: string, @Req() request: AdminRequest) {
    return this.accounts.deactivate(id, principal(request));
  }

  @Post(":id/reactivate")
  @HttpCode(200)
  @Requires("accounts.manage")
  reactivate(@Param("id", IdParam) id: string, @Req() request: AdminRequest) {
    return this.accounts.reactivate(id, principal(request));
  }
}

/** /api/admin/invitations — invitation links (OPS-141): made, listed and revoked by a Rootadmin (accounts.manage). */
@Controller("admin/invitations")
export class InvitationsController {
  constructor(private readonly accounts: AccountsService) {}

  @Get()
  @Requires("accounts.manage")
  list() {
    return this.accounts.listInvitations();
  }

  /** "New invitation link": the link is in this answer only. */
  @Post()
  @Requires("accounts.manage")
  create(@Req() request: AdminRequest, @Res({ passthrough: true }) response: Response) {
    noStore(response);
    return this.accounts.createInvitation(principal(request));
  }

  @Post(":id/revoke")
  @HttpCode(200)
  @Requires("accounts.manage")
  revoke(@Param("id", IdParam) id: string, @Req() request: AdminRequest) {
    return this.accounts.revokeInvitation(id, principal(request));
  }
}

/** /api/admin/profile — the signed-in admin's own settings (admin-desktop.pdf p18), whatever their role. */
@Controller("admin/profile")
export class ProfileController {
  constructor(private readonly accounts: AccountsService) {}

  @Get()
  @SignedIn()
  get(@Req() request: AdminRequest) {
    return this.accounts.profile(principal(request));
  }

  @Patch()
  @SignedIn()
  update(@Body(new ZodValidationPipe(ProfileRequest)) body: ProfileRequest, @Req() request: AdminRequest) {
    return this.accounts.updateProfile(principal(request), body);
  }

  /** multipart/form-data, one `file` field; PNG, JPEG or WebP (checked from the bytes), at most 2 MB. */
  @Post("picture")
  @SignedIn()
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: PICTURE_MAX_BYTES + 1, files: 1, fields: 0, parts: 2 } }))
  picture(@UploadedFileParam() file: { buffer: Buffer; size: number } | undefined, @Req() request: AdminRequest) {
    return this.accounts.setPicture(principal(request), file);
  }

  /** Archives the current picture (ADR 017): it moves to the previous pictures. */
  @Delete("picture")
  @SignedIn()
  removePicture(@Req() request: AdminRequest) {
    return this.accounts.removePicture(principal(request));
  }

  @Get("pictures")
  @SignedIn()
  previousPictures(@Req() request: AdminRequest) {
    return this.accounts.previousPictures(principal(request));
  }

  @Get("pictures/:id")
  @SignedIn()
  async ownPicture(@Param("id", IdParam) id: string, @Req() request: AdminRequest, @Res({ passthrough: true }) response: Response) {
    const picture = await this.accounts.ownPicture(principal(request), id);
    response.set({
      "Content-Type": picture.type,
      "Content-Length": String(picture.bytes.length),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-cache",
    });
    return new StreamableFile(picture.bytes);
  }

  @Post("pictures/:id/restore")
  @HttpCode(200)
  @SignedIn()
  restorePicture(@Param("id", IdParam) id: string, @Req() request: AdminRequest) {
    return this.accounts.restorePicture(principal(request), id);
  }

  @Post("email")
  @SignedIn()
  @Throttle(LOGIN_LIMIT)
  email(@Body(new ZodValidationPipe(ChangeEmailRequest)) body: ChangeEmailRequest, @Req() request: AdminRequest) {
    return this.accounts.changeEmail(principal(request), body.currentPassword, body.email);
  }

  @Post("password")
  @HttpCode(204)
  @SignedIn()
  @Throttle(LOGIN_LIMIT)
  async password(@Body(new ZodValidationPipe(ChangePasswordRequest)) body: ChangePasswordRequest, @Req() request: AdminRequest) {
    await this.accounts.changePassword(principal(request), body.currentPassword, body.newPassword);
  }

  /** "Delete account" = deactivate (decision 14); signs out everywhere. */
  @Post("deactivate")
  @HttpCode(204)
  @SignedIn()
  @Throttle(LOGIN_LIMIT)
  async deactivate(@Body(new ZodValidationPipe(DeactivateSelfRequest)) body: DeactivateSelfRequest, @Req() request: AdminRequest) {
    await this.accounts.deactivateSelf(principal(request), body.currentPassword);
  }
}

/**
 * /api/admin/auth/tokens — the invitation and reset pages (no session):
 * check a link, then set the password with it. Rate-limited like sign-in;
 * the token arrives in the body (it lives in the page URL's fragment).
 */
@Controller("admin/auth/tokens")
export class TokensController {
  constructor(private readonly accounts: AccountsService) {}

  @Post("inspect")
  @HttpCode(200)
  @AllowAnonymous()
  @Throttle({ default: { limit: 20, ttl: 15 * 60 * 1000 } })
  inspect(@Body(new ZodValidationPipe(InspectTokenRequest)) body: InspectTokenRequest, @Res({ passthrough: true }) response: Response) {
    noStore(response);
    return this.accounts.inspectToken(body.token);
  }

  @Post("accept")
  @HttpCode(200)
  @AllowAnonymous()
  @Throttle(LOGIN_LIMIT)
  accept(@Body(new ZodValidationPipe(AcceptTokenRequest)) body: AcceptTokenRequest, @Res({ passthrough: true }) response: Response) {
    noStore(response);
    return this.accounts.acceptToken(body.token, body.password);
  }
}

/**
 * /api/admin/auth/invitations — the sign-up page of an invitation link
 * (OPS-141, no session): check the link, then make the account (email and
 * password) and sign it in. Rate-limited like sign-in.
 */
@Controller("admin/auth/invitations")
export class SignUpController {
  constructor(
    private readonly accounts: AccountsService,
    private readonly auth: AuthService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Post("inspect")
  @HttpCode(200)
  @AllowAnonymous()
  @Throttle({ default: { limit: 20, ttl: 15 * 60 * 1000 } })
  inspect(@Body(new ZodValidationPipe(InspectTokenRequest)) body: InspectTokenRequest, @Res({ passthrough: true }) response: Response) {
    noStore(response);
    return this.accounts.inspectInvitation(body.token);
  }

  /** Makes the account and sets the session cookie: the new account lands on its (empty) profile. */
  @Post("accept")
  @HttpCode(204)
  @AllowAnonymous()
  @Throttle(LOGIN_LIMIT)
  async accept(@Body(new ZodValidationPipe(SignUpRequest)) body: SignUpRequest, @Res({ passthrough: true }) response: Response) {
    noStore(response);
    const { id } = await this.accounts.signUp(body.token, body.email, body.password);
    const { token, expiresAt } = await this.auth.startSession(id);
    response.cookie(sessionCookieName(this.config), token, sessionCookieOptions(this.config, expiresAt));
  }
}
