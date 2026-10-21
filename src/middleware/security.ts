import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import type { Request, Response, NextFunction } from "express";
import { env } from "../config/env.js";
import { defaultOrigins } from "../config/cors.js";

// ─── Security headers ────────────────────────────────────────
// Explicit helmet configuration instead of the defaults:
// - CSP locked down (`default-src 'none'`) — this is a JSON API, it must not
//   be able to load/execute anything.
// - HSTS with sub-domains + preload, referrer and framing protections.
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'none'"],
      baseUri: ["'none'"],
      formAction: ["'none'"],
      frameAncestors: ["'none'"],
    },
  },
  crossOriginResourcePolicy: { policy: "cross-origin" },
  referrerPolicy: { policy: "no-referrer" },
  strictTransportSecurity: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  frameguard: { action: "deny" },
});

// Minimal Permissions-Policy: browsers do not need any powerful features on
// a JSON API surface.
export const permissionsPolicy = (
  _req: Request,
  res: Response,
  next: NextFunction,
): void => {
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );
  next();
};

// ─── CORS ─────────────────────────────────────────────────────
// Normalise an origin list: trim whitespace, drop empty entries, strip a
// trailing slash, and keep only well-formed http/https URLs.
function normalizeOrigins(raw: string[]): string[] {
  const origins = raw
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .map((value) => value.replace(/\/+$/, ""));

  for (const origin of origins) {
    if (!/^https?:\/\//.test(origin) || !URL.canParse(origin)) {
      throw new Error(
        `Invalid CORS origin "${origin}": must be an absolute http/https URL`,
      );
    }
    if (origin === "*") {
      throw new Error(
        'Wildcard "*" is not allowed in CORS origins — list explicit origins',
      );
    }
  }

  return [...new Set(origins)];
}

export const corsOrigins: string[] = normalizeOrigins(
  env.CORS_ORIGINS ? env.CORS_ORIGINS.split(",") : defaultOrigins,
);

// Strict origin guard: reject requests that present an Origin header which
// is not on the allowlist (HTTP 403) instead of letting the browser-facing
// CORS check silently pass. Requests without an Origin header
// (server-to-server calls, curl, scanners) are not affected.
export const originGuard = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const origin = req.headers["origin"];
  if (typeof origin === "string" && origin.length > 0) {
    if (!corsOrigins.includes(origin.replace(/\/+$/, ""))) {
      res.status(403).json({ error: "Origin not allowed" });
      return;
    }
  }
  next();
};

export const corsMiddleware = cors({
  origin: corsOrigins,
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  credentials: false,
  maxAge: 600,
  optionsSuccessStatus: 204,
});

// ─── Rate limiting ────────────────────────────────────────────
export const rateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many requests from this IP, please try again after a minute",
  },
});

// Stricter limiter for the abuse-prone POST routes (email relay,
// confirmations): an unauthenticated attacker must not be able to pump
// emails through the API at the global rate.
export const strictRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
});
