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
  eventId: z.string().min(1, "Event ID is required"),
  fullName: z.string().min(1, "Full name is required"),
  email: z.coerce.string().email().nullable().optional(),
  phone: z.coerce.string().nullable().optional(),
  paymentIntentId: z.coerce.string().nullable().optional(),
});

const confirmationSchema = z.object({
  eventId: z.string().min(1, "Event ID is required"),
  eventTitle: z.string().optional(),
  eventDate: z.string().optional(),
  ticketCount: z.coerce.number().int().positive(),
  holders: z.array(
    z.object({
      fullName: z.string(),
      email: z
        .string()
        .email()
        .optional()
        .nullable()
        .transform((v) => v || null),
      phone: z
        .string()
        .optional()
        .nullable()
        .transform((v) => v || null),
    }),
  ),
  paymentIntentId: z.string().optional(),
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
              <p><strong>Eveniment:</strong> ${safeEventTitle}</p>
              <p><strong>Data:</strong> ${eventDate ? new Date(eventDate).toLocaleDateString("ro-RO") : "TBA"}</p>
              <p><strong>Număr participanți:</strong> ${ticketCount}</p>
              <p><strong>Participanți:</strong> ${namesList}</p>
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
