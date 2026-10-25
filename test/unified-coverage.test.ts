import "./setup-env.js";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SESSION_SLUGS } from "../src/config/session-slugs.js";
import { escapeHtml } from "../src/utils/escape-html.js";

describe("unified booking coverage", () => {
  it("session slugs are unique non-empty strings", () => {
    const values = Object.values(SESSION_SLUGS);
    assert.ok(values.length > 0);
    assert.equal(new Set(values).size, values.length);
    for (const slug of values) assert.ok(slug.length > 0);
  });

  it("escapeHtml changes HTML significant characters", () => {
    assert.notEqual(escapeHtml("<b>x</b>"), "<b>x</b>");
    assert.match(escapeHtml("<b>x</b>"), /&lt;b&gt;/);
  });
});
