import { SetMetadata, type ExecutionContext } from "@nestjs/common";
import { PATH_METADATA } from "@nestjs/common/constants.js";
import type { Reflector } from "@nestjs/core";
import type { Request } from "express";
import type { AdminPrincipal } from "./auth.service.js";

export const ALLOW_ANONYMOUS = "auth:allowAnonymous";

/** Opts one admin-area handler out of the session requirement (login only). */
export const AllowAnonymous = () => SetMetadata(ALLOW_ANONYMOUS, true);

export type AdminRequest = Request & { admin?: AdminPrincipal; cookies?: Record<string, string> };

/**
 * A handler is in the admin area when its *controller's declared path*
 * starts with `admin` — decided from route metadata, not the raw request
 * URL, so URL casing or encoding tricks can't route around the guard.
 * Every controller under /api/admin is therefore protected by default.
 */
export function isAdminArea(context: ExecutionContext, reflector: Reflector): boolean {
  const declared = reflector.get<string | string[] | undefined>(PATH_METADATA, context.getClass());
  const paths = Array.isArray(declared) ? declared : [declared ?? ""];
  return paths.some((path) => /^\/?admin(\/|$)/.test(path));
}

export function isAnonymousAllowed(context: ExecutionContext, reflector: Reflector): boolean {
  return reflector.getAllAndOverride<boolean>(ALLOW_ANONYMOUS, [context.getHandler(), context.getClass()]) === true;
}
