import { Inject, Injectable } from "@nestjs/common";
import { APP_CONFIG } from "../common/config/config.module.js";
import type { AppConfig } from "../common/config/env.js";
import { UnauthenticatedError } from "../common/errors/api-error.js";
import { AuthRepository } from "./auth.repository.js";
import { dummyPasswordHash, verifyPassword } from "./password.js";
import { generateSessionToken, hashSessionToken, SESSION_TOKEN_PATTERN } from "./session-token.js";

export interface AdminPrincipal {
  id: string;
  email: string;
  role: string;
  sessionId: string;
}

/** last_seen_at is only rewritten this often, not on every request. */
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

@Injectable()
export class AuthService {
  constructor(
    private readonly repository: AuthRepository,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** Returns a fresh session token, or throws one uniform error for any failure. */
  async login(email: string, password: string): Promise<{ token: string; expiresAt: Date }> {
    const admin = await this.repository.findAdminByEmail(email.trim());
    // Always run one scrypt verification so unknown and known emails cost the same.
    const valid = await verifyPassword(password, admin?.passwordHash ?? (await dummyPasswordHash()));
    if (!admin || !valid) throw new UnauthenticatedError("Invalid email or password.");

    const token = generateSessionToken();
    const expiresAt = new Date(Date.now() + this.config.session.maxDays * 24 * 60 * 60 * 1000);
    await this.repository.createSession(admin.id, hashSessionToken(token), expiresAt);
    return { token, expiresAt };
  }

  /** Resolves a cookie token to its admin, enforcing idle and absolute expiry. */
  async authenticate(token: string | undefined, now = new Date()): Promise<AdminPrincipal | undefined> {
    if (!token || !SESSION_TOKEN_PATTERN.test(token)) return undefined;
    const session = await this.repository.findLiveSession(hashSessionToken(token));
    if (!session) return undefined;

    const idleLimit = session.lastSeenAt.getTime() + this.config.session.idleMinutes * 60 * 1000;
    if (now.getTime() >= session.expiresAt.getTime() || now.getTime() >= idleLimit) {
      await this.repository.revokeSession(session.sessionId);
      return undefined;
    }
    if (now.getTime() - session.lastSeenAt.getTime() >= TOUCH_INTERVAL_MS) {
      await this.repository.touchSession(session.sessionId, now);
    }
    return { ...session.admin, sessionId: session.sessionId };
  }

  async logout(sessionId: string): Promise<void> {
    await this.repository.revokeSession(sessionId);
  }
}
