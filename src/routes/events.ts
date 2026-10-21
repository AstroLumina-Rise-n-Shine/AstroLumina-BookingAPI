import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { Resend } from "resend";
import * as d1 from "../services/d1.js";
import { env } from "../config/env.js";
import { createError } from "../middleware/error-handler.js";
import { escapeHtml } from "../utils/escape-html.js";

const router = Router();

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

const FROM_EMAIL = "AstroLumina <onboarding@resend.dev>";

const attendeeSchema = z.object({
  eventId: z.string().min(1, "Event ID is required").max(100),
  fullName: z
    .string()
    .min(1, "Full name is required")
    .max(100)
    .refine((v) => !/[\r\n]/.test(v), "Name must not contain CR/LF"),
  email: z.coerce.string().email().max(254).nullable().optional(),
  phone: z.coerce.string().max(32).nullable().optional(),
  paymentIntentId: z.coerce.string().max(100).nullable().optional(),
});

const confirmationSchema = z.object({
  eventId: z.string().min(1, "Event ID is required").max(100),
  eventTitle: z
    .string()
    .max(200)
    // Used in the email subject (header-bound) and HTML body: reject CR/LF.
    .refine((v) => !/[\r\n]/.test(v), "Event title must not contain CR/LF")
    .optional(),
  eventDate: z
    .string()
    .max(50)
    .refine((v) => !/[\r\n]/.test(v), "Event date must not contain CR/LF")
    .optional(),
  ticketCount: z.coerce.number().int().positive().max(50),
  holders: z
    .array(
      z.object({
        fullName: z
          .string()
          .max(100)
          .refine((v) => !/[\r\n]/.test(v), "Name must not contain CR/LF"),
        email: z
          .string()
          .email()
          .max(254)
          .optional()
          .nullable()
          .transform((v) => v || null),
        phone: z
          .string()
          .max(32)
          .optional()
          .nullable()
          .transform((v) => v || null),
      }),
    )
    .max(10, "At most 10 holders are allowed"),
  paymentIntentId: z.string().max(100).optional(),
});

router.get("/events/seats/:eventId", async (req: Request, res: Response) => {
  const eventId = req.params.eventId as string;
  const available = await d1.getAvailableSeats(eventId);

  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate",
  );
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.json({
    eventId,
    availableSeats: available,
    maxSeats: d1.MAX_SEATS,
    bookedSeats: d1.MAX_SEATS - available,
  });
});

router.post("/events/attendees", async (req: Request, res: Response) => {
  const parseResult = attendeeSchema.safeParse(req.body);
  if (!parseResult.success) {
    throw createError(400, "Invalid request body");
  }

  const { eventId, fullName, email, phone, paymentIntentId } = parseResult.data;

  const available = await d1.getAvailableSeats(eventId);
  if (available < 1) {
    throw createError(400, `No seats available`);
  }

  const attendeeId = await d1.addAttendee(
    eventId,
    fullName,
    email ?? null,
    phone ?? null,
    paymentIntentId ?? null,
  );

  res.json({ success: true, attendeeId });
});

router.post(
  "/events/send-event-confirmation",
  async (req: Request, res: Response) => {
    const parseResult = confirmationSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw createError(400, "Invalid request body");
    }

    const {
      eventId,
      eventTitle,
      eventDate,
      ticketCount,
      holders,
      paymentIntentId,
    } = parseResult.data;

    const available = await d1.getAvailableSeats(eventId);
    if (available < ticketCount) {
      throw createError(400, `Only ${available} seats available`);
    }

    const attendeePromises = holders.map((holder) => {
      return d1.addAttendee(
        eventId,
        holder.fullName,
        holder.email ?? null,
        holder.phone ?? null,
        paymentIntentId ?? null,
      );
    });
    await Promise.all(attendeePromises);

    const namesList = holders.map((h) => escapeHtml(h.fullName)).join(", ");
    const safeEventTitle = escapeHtml(eventTitle ?? "Constelații");
    // Pre-format the date into a plain string, then escape it like every
    // other interpolated value.
    const safeEventDate = escapeHtml(
      eventDate ? new Date(eventDate).toLocaleDateString("ro-RO") : "TBA",
    );
    // ticketCount is already a validated positive integer; escape anyway so
    // every interpolation in the template is inert.
    const safeTicketCount = escapeHtml(String(ticketCount));
    // Semgrep's raw-html-format rule does not recognise the standard
    // escape-html library wrapper used above. Every row below interpolates
    // only escapeHtml() output built from zod-validated, CR/LF-free inputs
    // (or a validated positive integer), so the heading is inert text. The
    // suppression is narrow: row variables only, this file only.
    // nosemgrep: javascript.express.security.injection.raw-html-format.raw-html-format
    const titleRow = `<p><strong>Eveniment:</strong> ${safeEventTitle}</p>`;
    // nosemgrep: javascript.express.security.injection.raw-html-format.raw-html-format
    const dateRow = `<p><strong>Data:</strong> ${safeEventDate}</p>`;
    // nosemgrep: javascript.express.security.injection.raw-html-format.raw-html-format
    const ticketRow = `<p><strong>Număr participanți:</strong> ${safeTicketCount}</p>`;
    // nosemgrep: javascript.express.security.injection.raw-html-format.raw-html-format
    const holdersRow = `<p><strong>Participanți:</strong> ${namesList}</p>`;
    const allEmails = holders.map((h) => h.email).filter(Boolean) as string[];
    const uniqueEmails = [...new Set(allEmails)];

    if (resend && uniqueEmails.length > 0) {
      await resend.emails.send({
        from: FROM_EMAIL,
        to: allEmails,
        subject: `Confirmare rezervare - ${safeEventTitle}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #0a0a1a; color: #f3e8ff;">
            <h1 style="color: #a855f7;">Confirmare rezervare</h1>
            <p>Stimate/doamna,</p>
            <p>Rezervarea ta a fost confirmată!</p>
            <div style="margin: 20px 0; padding: 15px; background: #1a1a2e; border-radius: 8px;">
              ${titleRow}
              ${dateRow}
              ${ticketRow}
              ${holdersRow}
            </div>
            <p>Vă așteptăm cu drag la eveniment!</p>
            <p style="margin-top: 30px;">Cu drag,<br>Echipa AstroLumina</p>
          </div>
        `,
      });
    }

    res.json({ success: true });
  },
);

export default router;
