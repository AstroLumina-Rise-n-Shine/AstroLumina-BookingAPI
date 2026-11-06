import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { escapeHtml } from "../src/utils/escape-html.js";

describe("escapeHtml", () => {
  it("escapes ampersand", () => {
    assert.equal(escapeHtml("a & b"), "a &amp; b");
  });

  it("escapes less-than", () => {
    assert.equal(escapeHtml("a < b"), "a &lt; b");
  });

  it("escapes greater-than", () => {
    assert.equal(escapeHtml("a > b"), "a &gt; b");
  });

  it("escapes double-quote", () => {
    assert.equal(escapeHtml('a " b'), 'a &quot; b');
  });

  it("escapes single-quote", () => {
    assert.equal(escapeHtml("a ' b"), "a &#39; b");
  });

  it("escapes all five characters in one string", () => {
    assert.equal(
      escapeHtml("&<>\"" + "'"),
      "&amp;&lt;&gt;&quot;&#39;",
    );
  });

  it("handles empty string", () => {
    assert.equal(escapeHtml(""), "");
  });

  it("leaves strings without special chars untouched", () => {
    assert.equal(escapeHtml("hello world"), "hello world");
    assert.equal(escapeHtml("București 2027"), "București 2027");
  });

  it("neutralizes an XSS attempt in an email context", () => {
    const payload = '<img src=x onerror=alert(1)>';
    const escaped = escapeHtml(payload);
    assert.equal(escaped, "&lt;img src=x onerror=alert(1)&gt;");
    assert.ok(escaped.includes("&lt;"));
    assert.ok(escaped.includes("&gt;"));
    assert.ok(!escaped.includes("<img"));
    assert.ok(!escaped.includes(">"));
  });

  it("escapes mixed content with HTML entities already present", () => {
    assert.equal(escapeHtml("&amp; already"), "&amp;amp; already");
  });
});
