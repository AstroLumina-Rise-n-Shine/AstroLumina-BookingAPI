import "./setup-env.js";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { originGuard, corsOrigins } from "../src/middleware/security.js";

describe("originGuard", () => {
  function makeReq(origin?: string): any {
    return { headers: origin ? { origin } : {} };
  }

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

  it("passes requests without Origin", () => {
    let called = false;
    originGuard(makeReq(), makeRes(), () => {
      called = true;
    });
    assert.equal(called, true);
  });

  it("passes an allowlisted origin (with trailing slash stripped)", () => {
    let called = false;
    const origin = corsOrigins[0] + "/";
    originGuard(makeReq(origin), makeRes(), () => {
      called = true;
    });
    assert.equal(called, true);
  });

  it("rejects a non-allowlisted origin", () => {
    let called = false;
    const res = makeRes();
    originGuard(makeReq("https://attacker.example"), res, () => {
      called = true;
    });
    assert.equal(called, false);
    assert.equal(res.statusCode, 403);
    assert.deepEqual(res.body, { error: "Origin not allowed" });
  });
});
