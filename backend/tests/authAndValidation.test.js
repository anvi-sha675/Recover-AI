import { test } from "node:test";
import assert from "node:assert/strict";
import { validatePolicyPatch, validateExecuteBody, requireApiKey, requireMinRole } from "../services/authAndValidation.js";

function mockRes() {
  const res = {};
  res.statusCode = 200;
  res.status = (code) => { res.statusCode = code; return res; };
  res.body = null;
  res.json = (b) => { res.body = b; return res; };
  return res;
}

test("validatePolicyPatch: rejects unknown keys", () => {
  const req = { body: { NOT_A_REAL_KEY: 1 } };
  const res = mockRes();
  let nextCalled = false;
  validatePolicyPatch(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 400);
});

test("validatePolicyPatch: rejects out-of-range confidence", () => {
  const req = { body: { MIN_RECOVERY_CONFIDENCE: 1.5 } };
  const res = mockRes();
  let nextCalled = false;
  validatePolicyPatch(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 400);
});

test("validatePolicyPatch: accepts a valid patch", () => {
  const req = { body: { MAX_AUTOMATED_RETRIES: 5, STOP_AFTER_SUCCESS: false } };
  const res = mockRes();
  let nextCalled = false;
  validatePolicyPatch(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
});

test("validateExecuteBody: rejects missing transaction", () => {
  const req = { body: {} };
  const res = mockRes();
  let nextCalled = false;
  validateExecuteBody(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 400);
});

test("validateExecuteBody: rejects negative amount", () => {
  const req = { body: { transaction: { amount: -100, customer_id: "c1" } } };
  const res = mockRes();
  let nextCalled = false;
  validateExecuteBody(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
});

test("requireApiKey: open demo mode when ADMIN_API_KEY unset", () => {
  delete process.env.ADMIN_API_KEY;
  const req = { header: () => null };
  const res = mockRes();
  let nextCalled = false;
  requireApiKey(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
});

test("requireApiKey: rejects wrong key when ADMIN_API_KEY is set", () => {
  process.env.ADMIN_API_KEY = "secret123";
  const req = { header: () => "wrong" };
  const res = mockRes();
  let nextCalled = false;
  requireApiKey(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
  delete process.env.ADMIN_API_KEY;
});
test("RBAC: REVIEWER key is allowed to approve (requireMinRole REVIEWER), but rejected for policy update (requires ADMIN)", () => {
  process.env.REVIEWER_API_KEY = "reviewer_key";
  process.env.ADMIN_API_KEY = "admin_key";

  const approveReq = { header: () => "reviewer_key" };
  const approveRes = mockRes();
  let approveNext = false;
  requireMinRole("REVIEWER")(approveReq, approveRes, () => { approveNext = true; });
  assert.equal(approveNext, true, "REVIEWER must be allowed to approve");

  const policyReq = { header: () => "reviewer_key" };
  const policyRes = mockRes();
  let policyNext = false;
  requireMinRole("ADMIN")(policyReq, policyRes, () => { policyNext = true; });
  assert.equal(policyNext, false, "REVIEWER must NOT be allowed to update policy");
  assert.equal(policyRes.statusCode, 403);

  delete process.env.REVIEWER_API_KEY;
  delete process.env.ADMIN_API_KEY;
});

test("RBAC: ADMIN key is allowed for both REVIEWER-level and ADMIN-level actions", () => {
  process.env.REVIEWER_API_KEY = "reviewer_key";
  process.env.ADMIN_API_KEY = "admin_key";

  const req1 = { header: () => "admin_key" };
  const res1 = mockRes();
  let next1 = false;
  requireMinRole("REVIEWER")(req1, res1, () => { next1 = true; });
  assert.equal(next1, true);

  const req2 = { header: () => "admin_key" };
  const res2 = mockRes();
  let next2 = false;
  requireMinRole("ADMIN")(req2, res2, () => { next2 = true; });
  assert.equal(next2, true);

  delete process.env.REVIEWER_API_KEY;
  delete process.env.ADMIN_API_KEY;
});

test("RBAC: an unrecognized key is unauthorized (401), not silently treated as OPERATOR", () => {
  process.env.ADMIN_API_KEY = "admin_key";
  const req = { header: () => "totally_unknown_key" };
  const res = mockRes();
  let nextCalled = false;
  requireMinRole("REVIEWER")(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
  delete process.env.ADMIN_API_KEY;
});

test("RBAC: with no roles configured at all, falls back to open demo mode (documented, not silent)", () => {
  const req = { header: () => null };
  const res = mockRes();
  let nextCalled = false;
  requireMinRole("ADMIN")(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
});
