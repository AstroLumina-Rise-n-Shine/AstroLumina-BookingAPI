import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { z } from "zod";
import { Resend } from "resend";
import axios from "axios";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { env } from "../config/env.js";
import { Sentry } from "../instrument.js";
import { createError } from "../middleware/error-handler.js";
import { escapeHtml } from "../utils/escape-html.js";

const router = Router();

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

const FROM_EMAIL = "AstroLumina <onboarding@resend.dev>";
const ASTROLUMINA_EMAIL = "AstroLumina <contact@astrolumina.ro>";

const emailSchema = z.object({
  to: z.string().email("Invalid email address").max(254),
  type: z.enum(["ghid-saturn", "soarele-stralucirea-ta"]),
});

const emailWithAttachmentsSchema = z.object({
  to: z.string().email("Invalid email address").max(254),
  subject: z
    .string()
    .min(1, "Subject is required")
    .max(200)
    // Header-bound value: reject CR/LF so no SMTP header injection.
    .refine((v) => !/[\r\n]/.test(v), "Subject must not contain CR/LF"),
  html: z.string().min(1, "HTML content is required").max(100_000),
  attachments: z
    .array(z.string().url().max(2048))
    .min(1, "At least one attachment URL is required")
    .max(5, "At most 5 attachments are allowed"),
});

const MAX_ATTACHMENTS_TOTAL_BYTES = 25 * 1024 * 1024; // 25 MB per email
const AXIOS_TIMEOUT_MS = 30_000;
const DISPLAY_FILENAME_MAX_LENGTH = 100;

const emailTemplates = {
  "ghid-saturn": {
    subject: "Ghidul lui Saturn în Berbec | Download",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #0a0a1a; color: #f3e8ff;">
        <h1 style="color: #a855f7;">Bine ai venit!</h1>
        <p>Eu sunt <strong>Ghidul lui Saturn în Berbec</strong> - ghidul tău personal pentru această perioadă intensă.</p>
        <p>Vei primi curând PDF-ul cu toate informațiile despre cum să navighezi energiile lui Saturn în semnul Berbecului.</p>
        <p style="margin-top: 30px;">Cu drag,<br>Echipa AstroLumina</p>
      </div>
    `,
  },
  "soarele-stralucirea-ta": {
    subject: "Soarele, Strălucirea Ta | Cadoul tău",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #0a0a1a; color: #f3e8ff;">
        <h1 style="color: #fbbf24;">Soarele, Strălucirea Ta</h1>
        <p>Felicitări! Ai primit cadoul gratuit de la AstroLumina.</p>
        <p>Acest mesaj conține informațiile despre tine - zodia Soarelui tău.</p>
        <p>În curând vei primi și PDF-ul cu detalii complete.</p>
        <p style="margin-top: 30px;">Cu drag,<br>Echipa AstroLumina</p>
      </div>
    `,
  },
};

/**
 * Derive a display filename for the Resend attachment metadata from the URL.
 * This name is never used in a filesystem path; it is sanitised anyway with
 * a strict allowlist so it cannot carry control characters or path-like
 * components into the email metadata.
 */
function sanitizeAttachmentFilename(fileUrl: string): string {
  let rawName: string;
  try {
    rawName = new URL(fileUrl).pathname.split("/").pop() ?? "";
    rawName = decodeURIComponent(rawName);
  } catch {
    rawName = "";
  }
  const cleaned = rawName
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/^\.+/, "_")
    .slice(0, DISPLAY_FILENAME_MAX_LENGTH);
  return cleaned.length > 0 ? cleaned : "attachment";
}

/**
 * Download the attachment into a freshly created private temp directory.
 * No user-controlled component participates in the filesystem path: the
 * directory comes from `fs.mkdtemp` and the file has a fixed name
 * ("attachment"); the user-controlled filename is only kept separately as
 * display metadata for Resend. The whole directory is cleaned up after
 * sending, regardless of success or failure.
 */
async function downloadR2ToLocal(
  fileUrl: string,
): Promise<{ tempDir: string; localPath: string }> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "astrolumina-"));
  // Fixed filename — never derived from the URL.
  const localPath = path.join(tempDir, "attachment");
  try {
    const response = await axios({
      url: fileUrl,
      method: "GET",
      responseType: "arraybuffer",
      timeout: AXIOS_TIMEOUT_MS,
      maxContentLength: MAX_ATTACHMENTS_TOTAL_BYTES,
      maxBodyLength: MAX_ATTACHMENTS_TOTAL_BYTES,
    });
    await fs.writeFile(localPath, Buffer.from(response.data));
  } catch (error) {
    await cleanupTempDir(tempDir);
    throw error;
  }
  return { tempDir, localPath };
}

async function cleanupTempDir(tempDir: string): Promise<void> {
  try {
    await fs.rm(tempDir, { recursive: true, force: true });
  } catch (error) {
    console.error("Failed to delete temp directory:", tempDir, error);
  }
}

router.post(
  "/send-email",
  async (req: Request, res: Response, next: NextFunction) => {
    const SentryInstance = Sentry;

    try {
      const parseResult = emailSchema.safeParse(req.body);
      if (!parseResult.success) {
        throw createError(400, "Invalid request body");
      }

      const { to, type } = parseResult.data;

      if (!resend) {
        throw createError(500, "Email service not configured");
      }

      SentryInstance.setContext("email", { to: to, type: type });

      const template = emailTemplates[type];

      const data = await resend.emails.send({
        from: FROM_EMAIL,
        to: to,
        subject: template.subject,
        html: template.html,
      });

      res.json({ success: true, data });
    } catch (error) {
      console.error("Email send error:", error);
      SentryInstance.captureException(error, {
        tags: { endpoint: "send-email" },
      });
      next(error);
    }
  },
);

router.post(
  "/send-email-with-attachments",
  async (req: Request, res: Response, next: NextFunction) => {
    const SentryInstance = Sentry;

    try {
      const parseResult = emailWithAttachmentsSchema.safeParse(req.body);
      if (!parseResult.success) {
        throw createError(400, "Invalid request body");
      }

      const { to, subject, html, attachments } = parseResult.data;

      if (!resend) {
        throw createError(500, "Email service not configured");
      }

      SentryInstance.setContext("email-with-attachments", {
        to: to,
        attachmentCount: attachments.length,
      });

      const attachmentData: { filename: string; content: string }[] = [];
      const attachmentTempDirs: string[] = [];

      try {
        for (const attachmentUrl of attachments) {
          const fullUrl = attachmentUrl.startsWith("http")
            ? attachmentUrl
            : `${env.R2_BASE_URL}/pdfs/${attachmentUrl}`;
          // SSRF guard: the server fetches this URL itself, so only our own
          // R2 host is allowed. An absolute attacker URL (internal metadata
          // endpoints, LAN hosts, third-party servers) is rejected before
          // any request leaves the box. Embedded credentials and non-HTTPS
          // URLs are rejected as well.
          const parsedUrl = new URL(fullUrl);
          if (
            parsedUrl.protocol !== "https:" ||
            parsedUrl.host !== new URL(env.R2_BASE_URL).host
          ) {
            throw createError(
              400,
              "Attachment URL must point to our own storage over HTTPS",
            );
          }
          if (parsedUrl.username !== "" || parsedUrl.password !== "") {
            throw createError(
              400,
              "Attachment URL must not contain embedded credentials",
            );
          }

          const displayName = sanitizeAttachmentFilename(fullUrl);
          const { tempDir, localPath } = await downloadR2ToLocal(fullUrl);
          attachmentTempDirs.push(tempDir);

          attachmentData.push({
            filename: displayName,
            content: (await fs.readFile(localPath)).toString("base64"),
          });
        }

        const data = await resend.emails.send({
          from: FROM_EMAIL,
          to: to,
          subject: subject,
          html: html,
          attachments: attachmentData,
        });

        res.json({ success: true, data });
      } finally {
        // Clean up the whole temp directories (each download lives in its
        // own mkdtemp directory, so recursive removal is safe).
        for (const tempDir of attachmentTempDirs) {
          await cleanupTempDir(tempDir);
        }
      }
    } catch (error) {
      console.error("Email with attachments error:", error);
      SentryInstance.captureException(error, {
        tags: { endpoint: "send-email-with-attachments" },
      });
      next(error);
    }
  },
);

const contactSchema = z.object({
  name: z.string().trim().min(2, "Name is required").max(100),
  email: z.string().trim().email("Invalid email address").max(254),
  subject: z
    .string()
    .trim()
    .min(3, "Subject is required")
    .max(150)
    // Header-bound value: reject CR/LF so no SMTP header injection.
    .refine((v) => !/[\r\n]/.test(v), "Subject must not contain CR/LF"),
  message: z.string().trim().min(10, "Message is too short").max(5000),
});

router.post(
  "/send-contact-email",
  async (req: Request, res: Response, next: NextFunction) => {
    const SentryInstance = Sentry;

    try {
      const parseResult = contactSchema.safeParse(req.body);
      if (!parseResult.success) {
        throw createError(400, "Invalid request body");
      }

      const { name, email, subject, message } = parseResult.data;

      if (!resend) {
        throw createError(500, "Email service not configured");
      }

      SentryInstance.setContext("contact-email", { from: email, subject: subject });

      const safeName = escapeHtml(name);
      const safeEmail = escapeHtml(email);
      const safeSubject = escapeHtml(subject);
      const safeMessage = escapeHtml(message).replace(/\n/g, "<br>");

      const data = await resend.emails.send({
        from: email,
        to: ASTROLUMINA_EMAIL,
        subject: `[Contact] ${subject}`,
        html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #0a0a1a; color: #f3e8ff;">
        <h1 style="color: #a855f7;">Mesaj nou din formularul de contact</h1>
        <p><strong>Nume:</strong> ${safeName}</p>
        <p><strong>Email:</strong> ${safeEmail}</p>
        <p><strong>Subiect:</strong> ${safeSubject}</p>
        <hr style="border-color: #4c1d95;">
        <p>${safeMessage}</p>
      </div>
    `,
        text: `Mesaj nou din formularul de contact\nNume: ${name}\nEmail: ${email}\nSubiect: ${subject}\n\n${message}`,
      });

      res.json({ success: true, data });
    } catch (error) {
      console.error("Contact email error:", error);
      SentryInstance.captureException(error, {
        tags: { endpoint: "send-contact-email" },
      });
      next(error);
    }
  },
);

export default router;
