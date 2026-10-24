import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import axios from "axios";
import { z } from "zod";
import { calcomService } from "../services/calcom.js";
import { Sentry } from "../instrument.js";
import { createError } from "../middleware/error-handler.js";
import {
  SESSION_SLUGS,
  resolveEventTypeForSession,
} from "../config/session-slugs.js";

const router = Router();

function normalizeStartUtcIso(start: string): string {
  const d = new Date(start);
  if (Number.isNaN(d.getTime())) return start;
  return d.toISOString();
}

function pruneEmptyMetadata(
  metadata: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!metadata) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(metadata)) {
    if (v != null && String(v).trim() !== "") {
      out[k] = String(v);
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

// ─── Validation Schemas ─────────────────────────────────────

const createBookingSchema = z
  .object({
    /** Optional if you send sessionKey — same mechanism as /api/availability/slots/session/:key */
    sessionKey: z.string().min(1).max(100).optional(),
    eventTypeId: z.number().int().positive().optional(),
    start: z
      .string()
      .min(1, "Start time is required (ISO 8601)")
      .max(64)
      // Passed into upstream API URLs/headers downstream: reject CR/LF.
      .refine((v) => !/[\r\n]/.test(v), "Start time must not contain CR/LF"),
    attendee: z.object({
      name: z
        .string()
        .min(1, "Attendee name is required")
        .max(100)
        .refine((v) => !/[\r\n]/.test(v), "Attendee name must not contain CR/LF"),
      email: z.string().email("Valid attendee email is required").max(254),
      timeZone: z.string().min(1, "Time zone is required").max(64),
      phoneNumber: z.string().max(32).optional(),
      language: z.string().max(10).optional(),
    }),
    metadata: z.record(z.string(), z.string()).optional(),
    bookingFieldsResponses: z.record(z.string(), z.unknown()).optional(),
    guests: z
      .array(z.string().email().max(254))
      .max(10, "At most 10 guests are allowed")
      .optional(),
  })
  .refine(
    (data) =>
      data.eventTypeId != null ||
      (data.sessionKey != null && data.sessionKey.length > 0),
    {
      message: "Either eventTypeId or sessionKey is required",
      path: ["sessionKey"],
    },
  );

const rescheduleBookingSchema = z.object({
  start: z
    .string()
    .min(1, "New start time is required (ISO 8601 UTC)")
    .max(64)
    .refine((v) => !/[\r\n]/.test(v), "Start time must not contain CR/LF"),
  rescheduledBy: z.string().email().max(254).optional(),
  reschedulingReason: z.string().max(500).optional(),
});

const bookingUidSchema = z.object({
  uid: z.string().min(1, "Booking UID is required").max(100),
});

// ─── Routes ─────────────────────────────────────────────────

/**
 * GET /api/bookings
 *
 * List bookings. Supports filtering by status, attendee email, and date range.
 */
router.get(
  "/api/bookings",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const params: Record<string, string> = {};

      if (req.query["status"]) params["status"] = String(req.query["status"]);
      if (req.query["attendeeEmail"])
        params["attendeeEmail"] = String(req.query["attendeeEmail"]);
      if (req.query["afterStart"])
        params["afterStart"] = String(req.query["afterStart"]);
      if (req.query["beforeEnd"])
        params["beforeEnd"] = String(req.query["beforeEnd"]);
      if (req.query["take"]) params["take"] = String(req.query["take"]);
      if (req.query["skip"]) params["skip"] = String(req.query["skip"]);
      if (req.query["eventTypeId"])
        params["eventTypeId"] = String(req.query["eventTypeId"]);

      const bookings = await Sentry.startSpan(
        { op: "calcom.bookings", name: "list-bookings" },
        async () => calcomService.getBookings(params),
      );

      res.json({ bookings });
    } catch (error) {
      console.error("Error fetching bookings:", error);
      Sentry.captureException(error, { tags: { endpoint: "list-bookings" } });
      next(error);
    }
  },
);

/**
 * GET /api/bookings/:uid
 *
 * Get a specific booking by UID.
 */
router.get(
  "/api/bookings/:uid",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parseResult = bookingUidSchema.safeParse(req.params);
      if (!parseResult.success) {
        throw createError(400, "Invalid booking UID");
      }

      const booking = await Sentry.startSpan(
        { op: "calcom.bookings", name: "get-booking" },
        async () => calcomService.getBooking(parseResult.data.uid),
      );

      res.json({ booking });
    } catch (error) {
      console.error("Error fetching booking:", error);
      Sentry.captureException(error, { tags: { endpoint: "get-booking" } });
      next(error);
    }
  },
);

/**
 * POST /api/bookings
 *
 * Create a new booking.
 *
 * Body:
 * {
 *   "sessionKey": "astrograma-natala-si-karmica",
 *   "start": "2026-04-01T10:00:00.000Z",
 *   "attendee": {
 *     "name": "Maria Popescu",
 *     "email": "maria@example.com",
 *     "timeZone": "Europe/Bucharest",
 *     "phoneNumber": "+40712345678"
 *   },
 *   "metadata": { "source": "stan-store" },
 *   "bookingFieldsResponses": {
 *     "phone": "+40712345678",
 *     "birth-date": "15.03.1990",
 *     "birth-place": "Bucharest, Romania",
 *     "birth-time": "14:30"
 *   }
 * }
 *
 * You can send a numeric "eventTypeId" instead of sessionKey if you know it.
 */
router.post(
  "/api/bookings",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parseResult = createBookingSchema.safeParse(req.body);
      if (!parseResult.success) {
        const errors = parseResult.error.issues.map((i) => i.message);
        throw createError(400, `Invalid booking data: ${errors.join(", ")}`);
      }

      const {
        sessionKey,
        eventTypeId: bodyEventTypeId,
        start,
        attendee,
        metadata,
        bookingFieldsResponses,
        guests,
      } = parseResult.data;

      let eventTypeId: number;

      if (sessionKey) {
        if (!SESSION_SLUGS[sessionKey]) {
          throw createError(
            400,
            `Unknown session key "${sessionKey}". Valid keys: ${Object.keys(SESSION_SLUGS).join(", ")}`,
          );
        }
        const eventTypes = await Sentry.startSpan(
          { op: "calcom.event-types", name: "resolve-booking-session" },
          async () => calcomService.getEventTypes(),
        );
        const eventType = resolveEventTypeForSession(sessionKey, eventTypes);

        if (!eventType) {
          throw createError(
            404,
            `Cal.com event type for session "${sessionKey}" not found. Run: npm run seed`,
          );
        }
        eventTypeId = eventType.id;
      } else if (bodyEventTypeId != null) {
        eventTypeId = bodyEventTypeId;
      } else {
        throw createError(400, "Either eventTypeId or sessionKey is required");
      }

      const startUtc = normalizeStartUtcIso(start);
      const metadataClean = pruneEmptyMetadata(metadata);

      const booking = await Sentry.startSpan(
        { op: "calcom.bookings", name: "create-booking" },
        async () =>
          calcomService.createBooking({
            eventTypeId,
            start: startUtc,
            attendee,
            metadata: metadataClean,
            bookingFieldsResponses,
            guests,
          }),
      );

      res.status(201).json({ booking });
    } catch (error) {
      console.error("Error creating booking:", error);
      if (axios.isAxiosError(error) && error.response?.data) {
        console.error(
          "Cal.com error response:",
          JSON.stringify((error.response as any).data, null, 2),
        );
      }
      Sentry.captureException(error, { tags: { endpoint: "create-booking" } });
      next(error);
    }
  },
);

/**
 * PATCH /api/bookings/:uid/reschedule
 *
 * Reschedule an existing booking.
 *
 * Body:
 * {
 *   "start": "2026-04-02T14:00:00Z",
 *   "rescheduledBy": "maria@example.com",
 *   "reschedulingReason": "Conflict with work schedule"
 * }
 */
router.patch(
  "/api/bookings/:uid/reschedule",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const uidResult = bookingUidSchema.safeParse(req.params);
      if (!uidResult.success) {
        throw createError(400, "Invalid booking UID");
      }

      const bodyResult = rescheduleBookingSchema.safeParse(req.body);
      if (!bodyResult.success) {
        const errors = bodyResult.error.issues.map((i) => i.message);
        throw createError(400, `Invalid reschedule data: ${errors.join(", ")}`);
      }

      const booking = await Sentry.startSpan(
        { op: "calcom.bookings", name: "reschedule-booking" },
        async () =>
          calcomService.rescheduleBooking(uidResult.data.uid, bodyResult.data),
      );

      res.json({ booking });
    } catch (error) {
      console.error("Error rescheduling booking:", error);
      Sentry.captureException(error, {
        tags: { endpoint: "reschedule-booking" },
      });
      next(error);
    }
  },
);

/**
 * DELETE /api/bookings/:uid
 *
 * Cancel a booking. Optionally provide a cancellation reason.
 *
 * Body (optional):
 * {
 *   "reason": "Schedule conflict"
 * }
 */
router.delete(
  "/api/bookings/:uid",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const uidResult = bookingUidSchema.safeParse(req.params);
      if (!uidResult.success) {
        throw createError(400, "Invalid booking UID");
      }

      const reason = (req.body as { reason?: string } | undefined)?.reason;

      await Sentry.startSpan(
        { op: "calcom.bookings", name: "cancel-booking" },
        async () => calcomService.cancelBooking(uidResult.data.uid, reason),
      );

      res.json({ message: "Booking cancelled successfully" });
    } catch (error) {
      console.error("Error cancelling booking:", error);
      Sentry.captureException(error, { tags: { endpoint: "cancel-booking" } });
      next(error);
    }
  },
);

export default router;
