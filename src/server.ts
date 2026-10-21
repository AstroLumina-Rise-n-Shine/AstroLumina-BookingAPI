// Sentry instrument must be loaded first
import { Sentry } from "./instrument.js";

import express from "express";
import compression from "compression";
import morgan from "morgan";
import { env } from "./config/env.js";
import {
  securityHeaders,
  permissionsPolicy,
  originGuard,
  corsMiddleware,
  rateLimiter,
  strictRateLimiter,
} from "./middleware/security.js";
import {
  payloadTooLargeHandler,
  notFoundHandler,
  globalErrorHandler,
} from "./middleware/error-handler.js";
import healthRouter from "./routes/health.js";
import { metricsHandler, metricsMiddleware } from "./metrics.js";
import eventTypesRouter from "./routes/event-types.js";
import bookingsRouter from "./routes/bookings.js";
import availabilityRouter from "./routes/availability.js";
import emailRouter from "./routes/email.js";
import eventsRouter from "./routes/events.js";

const isProduction = env.NODE_ENV === "production";

const app = express();

// Trust proxy for correct IP detection behind reverse proxy (needed for rate limiting)
app.set("trust proxy", 1);

// ─── Metrics ─────────────────────────────────────────────────
// Registered before the security middlewares so Prometheus scrapes are
// never rate-limited nor CORS-filtered. Reachable only in-cluster (the
// Traefik routes expose /api/*, never /metrics).
app.get("/metrics", metricsHandler);
app.use(metricsMiddleware);

// ─── Security ────────────────────────────────────────────────
app.disable("x-powered-by");
app.use(securityHeaders);
app.use(permissionsPolicy);
app.use(originGuard);
app.use(corsMiddleware);
app.use(rateLimiter);

// ─── Compression ─────────────────────────────────────────────
app.use(compression());

// ─── Logging ─────────────────────────────────────────────────
app.use(morgan(isProduction ? "combined" : "dev"));

// ─── Body parser ─────────────────────────────────────────────
// This API receives small JSON payloads only; 256kb is ample for any of
// the booking/email/contact bodies and caps abuse surface.
app.use(express.json({ limit: "256kb" }));

// ─── robots.txt ──────────────────────────────────────────────
// Nothing on this API is meant for search engines; disallow everything so
// scanners/crawlers do not enumerate route paths.
app.get("/robots.txt", (_req, res) => {
  res.type("text/plain").send("User-agent: *\nDisallow: /\n");
});

// ─── Strict rate limiting for abuse-prone POST routes ────────
// The email relay and event-confirmation endpoints are unauthenticated
// POSTs that trigger outbound emails/rate-limited work; they get their own
// tighter bucket (5 req/min) on top of the global 30 req/min limiter.
app.use(
  [
    "/send-email",
    "/send-email-with-attachments",
    "/send-contact-email",
    "/events/send-event-confirmation",
  ],
  strictRateLimiter,
);

// ─── Routes ──────────────────────────────────────────────────
app.use(healthRouter);
app.use(eventTypesRouter);
app.use(bookingsRouter);
app.use(availabilityRouter);
app.use(emailRouter);
app.use(eventsRouter);

// ─── Error handling ──────────────────────────────────────────
app.use(payloadTooLargeHandler);
app.use(notFoundHandler);

// Sentry error handler — must be after routes
Sentry.setupExpressErrorHandler(app);

// Global error handler — must be last
app.use(globalErrorHandler);

// ─── Server startup ──────────────────────────────────────────
const server = app.listen(env.BOOKING_API_SERVER_PORT, () => {
  console.log(
    `🚀 Booking API running on http://localhost:${env.BOOKING_API_SERVER_PORT}`,
  );
  console.log(`   Environment: ${env.NODE_ENV}`);
  console.log(`   Node: ${process.version}`);
});

// ─── Connection tracking for graceful shutdown ────────────────
const connections = new Set<import("net").Socket>();

server.on("connection", (conn) => {
  connections.add(conn);
  conn.on("close", () => connections.delete(conn));
});

// ─── Graceful shutdown ───────────────────────────────────────
const gracefulShutdown = async (signal: string) => {
  console.log(`\n⚠️  Received ${signal}. Starting graceful shutdown...`);

  server.close(async () => {
    console.log("   HTTP server closed.");

    await Sentry.close(2000);
    console.log("   Sentry flushed.");

    process.exit(0);
  });

  for (const conn of connections) {
    conn.destroy();
  }

  setTimeout(() => {
    console.error("   Forced shutdown after timeout.");
    process.exit(1);
  }, 10_000);
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
