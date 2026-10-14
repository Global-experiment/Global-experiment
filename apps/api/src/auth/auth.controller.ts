import { Body, Controller, Get, HttpCode, Inject, Patch, Post, Req, Res } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Response } from "express";
import { z } from "zod";
import { APP_CONFIG } from "../common/config/config.module.js";
import type { AppConfig } from "../common/config/env.js";
import { UnauthenticatedError } from "../common/errors/api-error.js";
import { ZodValidationPipe } from "../common/validation/zod-validation.pipe.js";
import { AllowAnonymous, type AdminRequest } from "./admin-area.js";
import { AuthService } from "./auth.service.js";
import { sessionCookieName, sessionCookieOptions } from "./session-cookie.js";

export const LoginRequest = z.object({
  email: z.email().max(320),
  password: z.string().min(1).max(1024),
});
export type LoginRequest = z.infer<typeof LoginRequest>;

/** A blank name clears it (the user card then shows the email's local part). */
export const ProfileRequest = z.object({
  displayName: z
    .string()
    .trim()
    .max(80, "Display name must be 80 characters or fewer.")
    .nullable()
    .transform((value) => value || null),
});
export type ProfileRequest = z.infer<typeof ProfileRequest>;

const LOGIN_LIMIT = { default: { limit: 5, ttl: 15 * 60 * 1000 } };

@Controller("admin/auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** POST /api/admin/auth/login — sets the HttpOnly session cookie, no body. */
  @Post("login")
  @HttpCode(204)
  @AllowAnonymous()
  @Throttle(LOGIN_LIMIT)
  async login(@Body(new ZodValidationPipe(LoginRequest)) body: LoginRequest, @Res({ passthrough: true }) res: Response) {
    const { token, expiresAt } = await this.auth.login(body.email, body.password);
    res.cookie(sessionCookieName(this.config), token, sessionCookieOptions(this.config, expiresAt));
  }

  /** POST /api/admin/auth/logout — revokes the session server-side. */
  @Post("logout")
  @HttpCode(204)
  async logout(@Req() req: AdminRequest, @Res({ passthrough: true }) res: Response) {
    if (req.admin) await this.auth.logout(req.admin.sessionId);
    res.clearCookie(sessionCookieName(this.config), sessionCookieOptions(this.config));
  }

  /** GET /api/admin/auth/session — who is signed in (never the password/session data). */
  @Get("session")
  session(@Req() req: AdminRequest) {
    if (!req.admin) throw new UnauthenticatedError();
    const { id, email, role, displayName } = req.admin;
    return { admin: { id, email, role, displayName } };
  }

  /** PATCH /api/admin/auth/profile — the signed-in admin's own display name. */
  @Patch("profile")
  async updateProfile(@Req() req: AdminRequest, @Body(new ZodValidationPipe(ProfileRequest)) body: ProfileRequest) {
    if (!req.admin) throw new UnauthenticatedError();
    await this.auth.setDisplayName(req.admin.id, body.displayName);
    const { id, email, role } = req.admin;
    return { admin: { id, email, role, displayName: body.displayName } };
  }
}
