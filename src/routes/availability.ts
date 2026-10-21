import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { z } from "zod";
import { calcomService } from "../services/calcom.js";
import { Sentry } from "../instrument.js";
import { createError } from "../middleware/error-handler.js";
import {
  SESSION_SLUGS,
  resolveEventTypeForSession,
} from "../config/session-slugs.js";

const router = Router();

const slotsQuerySchema = z.object({
  eventTypeId: z.coerce.number().int().positive("eventTypeId is required"),
  startTime: z
    .string()
    .min(1, "startTime is required (ISO 8601)")
    .max(64)
    .refine((v) => !/[\r\n]/.test(v), "startTime must not contain CR/LF"),
  endTime: z
    .string()
    .min(1, "endTime is required (ISO 8601)")
    .max(64)
    .refine((v) => !/[\r\n]/.test(v), "endTime must not contain CR/LF"),
  timeZone: z.string().max(64).default("Europe/Bucharest"),
});

/**
 * GET /api/availability/slots
 *
 * Get available time slots for a given event type and date range.
 *
 * Query params:
 *   - eventTypeId: number (required) — The Cal.com event type ID
 *   - startTime: string (required) — ISO 8601 start of range
 *   - endTime: string (required) — ISO 8601 end of range
 *   - timeZone: string (optional) — defaults to Europe/Bucharest
 *
 * Example:
 *   GET /api/availability/slots?eventTypeId=123&startTime=2026-04-01T00:00:00Z&endTime=2026-04-07T23:59:59Z
 */
router.get(
  "/api/availability/slots",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parseResult = slotsQuerySchema.safeParse(req.query);
      if (!parseResult.success) {
        const errors = parseResult.error.issues.map((i) => i.message);
        throw createError(
          400,
          `Invalid query parameters: ${errors.join(", ")}`,
        );
      }

      const { eventTypeId, startTime, endTime, timeZone } = parseResult.data;

      const slots = await Sentry.startSpan(
        { op: "calcom.availability", name: "get-slots" },
        async () =>
          calcomService.getAvailableSlots(
            eventTypeId,
            startTime,
            endTime,
            timeZone,
          ),
      );

      res.json({ slots: slots.slots ?? slots });
    } catch (error) {
      console.error("Error fetching availability slots:", error);
      Sentry.captureException(error, {
        tags: { endpoint: "availability-slots" },
      });
      next(error);
    }
  },
);

/**
 * GET /api/availability/slots/session/:sessionKey
 *
 * Convenience endpoint that resolves the session key to an event type ID
 * and returns available slots. Useful for the frontend.
 *
 * Path params:
 *   - sessionKey: "astrograma-natala-si-karmica" | "astrograma-relationala" | "astrograma-previzionala"
 */
router.get(
  "/api/availability/slots/session/:sessionKey",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const sessionKey = String(req.params["sessionKey"] ?? "");
      const expectedSlug = SESSION_SLUGS[sessionKey];

      if (!expectedSlug) {
        throw createError(
          400,
          `Unknown session key "${sessionKey}". Valid keys: ${Object.keys(SESSION_SLUGS).join(", ")}`,
        );
      }

      const queryParse = z
        .object({
          startTime: z.string().min(1).max(64),
          endTime: z.string().min(1).max(64),
          timeZone: z.string().max(64).default("Europe/Bucharest"),
        })
        .safeParse(req.query);

      if (!queryParse.success) {
        throw createError(
          400,
          "startTime and endTime query parameters are required",
        );
      }

      const eventTypes = await Sentry.startSpan(
        { op: "calcom.event-types", name: "resolve-session-event-type" },
        async () => calcomService.getEventTypes(),
      );

      const eventType = resolveEventTypeForSession(sessionKey, eventTypes);

      if (!eventType) {
        throw createError(
          404,
          `Cal.com event type for "${sessionKey}" not found (slug: ${expectedSlug}). Run the seed script first: npm run seed`,
        );
      }

      const { startTime, endTime, timeZone } = queryParse.data;

      const slots = await Sentry.startSpan(
        { op: "calcom.availability", name: "get-session-slots" },
        async () =>
          calcomService.getAvailableSlots(
            eventType.id,
            startTime,
            endTime,
            timeZone,
          ),
      );

      res.json({
        sessionKey,
        eventTypeId: eventType.id,
        slots: slots.slots ?? slots,
      });
    } catch (error) {
      console.error("Error fetching session slots:", error);
      Sentry.captureException(error, { tags: { endpoint: "session-slots" } });
      next(error);
    }
  },
);

export default router;
