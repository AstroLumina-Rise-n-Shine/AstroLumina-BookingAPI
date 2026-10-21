// Shared helper that escapes the five HTML-significant characters so
// user-supplied strings can be interpolated into HTML email templates
// (e.g. confirmation emails rendered by the recipient's mail client) as
// inert text. Without this, a booking name like `<img src=x onerror=...>`
// would execute in the recipient's mail client (stored XSS via HTML email).
//
// This delegates to the standard `escape-html` package instead of a
// hand-written replacement chain, so the escaping logic is externally
// audited and maintained.
import escapeHtmlLib from "escape-html";

/** Escape the five HTML-significant characters: & < > " ' */
export function escapeHtml(value: string): string {
  return escapeHtmlLib(value);
}
