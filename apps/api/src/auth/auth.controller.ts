import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Response } from "express";
import { z } from "zod";
import { SignedIn } from "../access-control/requires.js";
import { APP_CONFIG } from "../common/config/config.module.js";
import type { AppConfig } from "../common/config/env.js";
import { UnauthenticatedError } from "../common/errors/api-error.js";
import { ZodValidationPipe } from "../common/validation/zod-validation.pipe.js";
import { AllowAnonymous, type AdminRequest } from "./admin-area.js";
import { AuthService, type AdminPrincipal } from "./auth.service.js";
import { sessionCookieName, sessionCookieOptions } from "./session-cookie.js";

export const LoginRequest = z.object({
  email: z.email().max(320),
  password: z.string().min(1).max(1024),
});
export type LoginRequest = z.infer<typeof LoginRequest>;

/**
 * Sign-in and password attempts: 5 per 15 minutes per client IP. The
 * browser suites (one IP, many accounts) may raise it with
 * E2E_LOGIN_LIMIT, read only under NODE_ENV=test — never in production.
 */
const e2eLimit = process.env.NODE_ENV === "test" ? Number(process.env.E2E_LOGIN_LIMIT) : NaN;
export const LOGIN_LIMIT = { default: { limit: Number.isInteger(e2eLimit) && e2eLimit > 0 ? e2eLimit : 5, ttl: 15 * 60 * 1000 } };

/** What the admin app needs about the signed-in admin (never a password or token). */
export function sessionView(admin: AdminPrincipal) {
  return {
    admin: {
      id: admin.id,
      email: admin.email,
      role: admin.role,
      roleLabel: admin.roleLabel,
      displayName: admin.displayName,
      accountId: `GE-${String(admin.accountNumber).padStart(6, "0")}`,
      timeZone: admin.timeZone,
      appearance: admin.appearance,
      hasPicture: admin.hasPicture,
      permissions: [...admin.permissions].sort(),
    },
  };
}

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
  @SignedIn()
  async logout(@Req() req: AdminRequest, @Res({ passthrough: true }) res: Response) {
    if (req.admin) await this.auth.logout(req.admin.sessionId);
    res.clearCookie(sessionCookieName(this.config), sessionCookieOptions(this.config));
  }

  /** GET /api/admin/auth/session — who is signed in, their role's permissions and preferences. */
  @Get("session")
  @SignedIn()
  session(@Req() req: AdminRequest) {
    if (!req.admin) throw new UnauthenticatedError();
    return sessionView(req.admin);
  }
}
