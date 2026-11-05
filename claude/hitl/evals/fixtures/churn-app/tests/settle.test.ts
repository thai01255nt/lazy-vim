import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { settle } from "../src/settle.ts";

describe("settle", () => {
  /** @covers settle @ac FEE-T1.AC1 @kind example @origin test-author */
  it("FEE-T1.AC1 keeps a zero amount at zero or more", () => { assert.equal(settle(0) >= 0, true); });
  /** @covers settle @ac FEE-T1.AC2 @kind example @origin test-author */
  it("FEE-T1.AC2 adds the fee", () => { assert.equal(settle(10), 11); });
});
