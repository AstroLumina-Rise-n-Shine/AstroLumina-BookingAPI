// Escapes the five HTML-significant characters so user-supplied strings can
// be interpolated into the confirmation emails as inert text. Without this,
// a booking name like `<img src=x onerror=...>` would execute in the
// recipient's mail client (stored XSS via the Resend HTML email).
export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
