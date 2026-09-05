import { test } from "node:test";
import assert from "node:assert/strict";
import { toPaise, fromPaise, sumRupeesSafely } from "../services/money.js";

test("money: toPaise/fromPaise round-trip correctly", () => {
  assert.equal(toPaise(35000), 3500000);
  assert.equal(fromPaise(3500000), 35000);
});

test("money: sumRupeesSafely avoids classic float-accumulation drift", () => {
  const amounts = Array(30).fill(0.1);
  const safe = sumRupeesSafely(amounts);
  assert.equal(safe, 3, "paise-based summation must be exact, unlike naive float addition");
});

test("money: sumRupeesSafely handles realistic rupee amounts exactly", () => {
  const amounts = [4999, 35000, 1500.5, 2999.99];
  assert.equal(sumRupeesSafely(amounts), 44499.49);
});

test("money: handles fintech edge-case amounts precisely (₹0.01, ₹99.99, ₹4999.99, large amounts)", () => {
  assert.equal(toPaise(0.01), 1);
  assert.equal(toPaise(99.99), 9999);
  assert.equal(toPaise(4999.99), 499999);
  assert.equal(toPaise(9999999.99), 999999999);
  assert.equal(fromPaise(1), 0.01);
  assert.equal(fromPaise(9999), 99.99);
  assert.equal(sumRupeesSafely([0.01, 99.99, 4999.99]), 5099.99);
});
