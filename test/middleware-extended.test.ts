import { describe, it } from "node:test";
import assert from "node:assert/strict";
import "./setup-env-process.js";
import type { Request, Response, NextFunction } from "express";

import {
  createError,
  globalErrorHandler,
  notFoundHandler,
  calComErrorMessage,
} from "../src/middleware/error-handler.js";
import { originGuard } from "../src/middleware/security.js";

function makeRequest(headers: Record<string, string> = {}, body?: unknown): Request {
  return { headers, body } as unknown as Request;
}

function makeResponse(): Response {
  const res: any = {
    statusCode: 200,
    _json: undefined as any,
    status(code: number) { this.statusCode = code; return this; },
    json(data: unknown) { this._json = data; return this; },
    setHeader() { return this; },
  };
  return res;
}

function nextFn(): NextFunction {
  return (() => {}) as unknown as NextFunction;
}

describe("createError (BookingAPI)", () => {
  it("creates 4xx error with expose=true", () => {
    const err = createError(400, "Bad request");
    assert.equal(err.statusCode, 400);
    assert.equal(err.expose, true);
  });

  it("creates 5xx error with expose=false", () => {
    const err = createError(500, "Internal error");
    assert.equal(err.statusCode, 500);
    assert.equal(err.expose, false);
  });
});

describe("calComErrorMessage", () => {
  it("returns string error when error is string", () => {
    assert.equal(calComErrorMessage({ error: "something failed" }), "something failed");
  });

  it("returns nested error.message", () => {
    assert.equal(calComErrorMessage({ error: { message: "nested error" } }), "nested error");
  });

  it("returns JSON.stringify for nested error object", () => {
    assert.equal(calComErrorMessage({ error: { code: 123 } }), '{"code":123}');
  });

  it("returns top-level message", () => {
    assert.equal(calComErrorMessage({ message: "top error" }), "top error");
  });

  it("returns undefined for null/primitive", () => {
    assert.equal(calComErrorMessage(null), undefined);
    assert.equal(calComErrorMessage("string"), undefined);
    assert.equal(calComErrorMessage(42), undefined);
    assert.equal(calComErrorMessage({}), undefined);
  });
});

describe("globalErrorHandler (BookingAPI)", () => {
  it("surfaces message for 4xx in non-production", () => {
    const err = createError(400, "Invalid booking data");
    const res = makeResponse();
    globalErrorHandler(err, makeRequest(), res, nextFn());
    assert.equal(res.statusCode, 400);
    assert.equal(res._json?.error, "Invalid booking data");
  });

  it("surfaces message for 5xx in non-production (BookingAPI behavior)", () => {
    const err = createError(500, "Database exploded");
    const res = makeResponse();
    globalErrorHandler(err, makeRequest(), res, nextFn());
    assert.equal(res.statusCode, 500);
    assert.equal(res._json?.error, "Database exploded");
  });
});

describe("notFoundHandler (BookingAPI)", () => {
  it("returns 404", () => {
    const res = makeResponse();
    notFoundHandler(makeRequest(), res);
    assert.equal(res.statusCode, 404);
    assert.equal(res._json?.error, "Route not found");
  });
});

describe("originGuard (BookingAPI)", () => {
  const validOrigin = "https://astrolumina.pages.dev";

  it("passes without Origin header", () => {
    const res = makeResponse();
    const next = nextFn();
    originGuard(makeRequest({}), res, next);
    assert.equal(res.statusCode, 200);
  });

  it("passes allowlisted origin", () => {
    const res = makeResponse();
    const next = nextFn();
    originGuard(makeRequest({ origin: validOrigin }), res, next);
    assert.equal(res.statusCode, 200);
  });

  it("rejects foreign origin with 403", () => {
    const res = makeResponse();
    const next = nextFn();
    originGuard(makeRequest({ origin: "https://evil.com" }), res, next);
    assert.equal(res.statusCode, 403);
    assert.equal(res._json?.error, "Origin not allowed");
  });

  it("strips trailing slash before matching", () => {
    const res = makeResponse();
    const next = nextFn();
    originGuard(makeRequest({ origin: "https://astrolumina.pages.dev/" }), res, next);
    assert.equal(res.statusCode, 200);
  });
});
