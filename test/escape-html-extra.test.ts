import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { escapeHtml } from "../src/utils/escape-html.js";

describe("escapeHtml XSS hardening", () => {
  it("neutralizes script tags", () => {
    assert.equal(escapeHtml("<script>alert(1)</script>"), "&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("neutralizes image and event handler payloads", () => {
    const input = '<img src=x onerror="alert(1)">';
    assert.ok(!escapeHtml(input).includes("<img"));
    assert.match(escapeHtml(input), /&lt;img/);
  });

  it("escapes quotes to block attribute breakout", () => {
    const escaped = escapeHtml('" onmouseover="alert(1)');
    assert.ok(!escaped.includes('"'));
  });

  it("handles empty and plain strings without changes", () => {
    assert.equal(escapeHtml(""), "");
    assert.equal(escapeHtml("hello world"), "hello world");
  });

  it("preserves valid unicode while escaping", () => {
    assert.equal(escapeHtml("café <tag>"), "café &lt;tag&gt;");
  });
});
