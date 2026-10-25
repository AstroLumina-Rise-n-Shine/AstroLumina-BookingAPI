import "./setup-env.js";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createError,
  payloadTooLargeHandler,
  notFoundHandler,
  globalErrorHandler,
} from "../src/middleware/error-handler.js";

describe("createError", () => {
  it("marks client errors as exposeable", () => {
    const err = createError(404, "missing");
    assert.equal(err.statusCode, 404);
    assert.equal(err.expose, true);
    assert.equal(err.message, "missing");
  });

  it("marks server errors as hidden", () => {
    const err = createError(503, "offline");
    assert.equal(err.statusCode, 503);
    assert.equal(err.expose, false);
  });
});

describe("error handlers", () => {
  function makeRes() {
    const res: any = {};
    res.status = (code: number) => {
      res.statusCode = code;
      return res;
    };
    res.json = (body: any) => {
      res.body = body;
      return res;
    };
    return res;
  }

  it("notFoundHandler returns 404", () => {
    const res = makeRes();
    notFoundHandler({} as any, res as any);
    assert.equal(res.statusCode, 404);
  });

  it("globalErrorHandler surfaces message in non-production", () => {
    const res = makeRes();
    globalErrorHandler(
      { statusCode: 500, message: "boom" } as any,
      {} as any,
      res as any,
      () => {},
    );
    assert.equal(res.statusCode, 500);
    assert.equal(res.body.error, "boom");
  });

  it("payloadTooLargeHandler replies 413", () => {
    const res = makeRes();
    let nextCalled = false;
    payloadTooLargeHandler(
      { message: "entity.too.large", type: "entity.too.large" } as any,
      {} as any,
      res as any,
      () => { nextCalled = true; },
    );
    assert.equal(res.statusCode, 413);
    assert.equal(nextCalled, false);
  });
});
