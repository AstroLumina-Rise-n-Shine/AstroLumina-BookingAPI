import "./setup-env.js";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { calComErrorMessage } from "../src/middleware/error-handler.js";

describe("calComErrorMessage", () => {
  it("returns string error property", () => {
    assert.equal(calComErrorMessage({ error: "boom" }), "boom");
  });

  it("extracts nested error.message", () => {
    assert.equal(calComErrorMessage({ error: { message: "nested" } }), "nested");
  });

  it("serializes a nested error object without message", () => {
    assert.equal(calComErrorMessage({ error: { code: 42 } }), '{"code":42}');
  });

  it("returns a top-level message if present", () => {
    assert.equal(calComErrorMessage({ message: "top-level" }), "top-level");
  });

  it("returns undefined for primitives and null", () => {
    assert.equal(calComErrorMessage(null), undefined);
    assert.equal(calComErrorMessage(42), undefined);
    assert.equal(calComErrorMessage("string"), undefined);
  });
});
