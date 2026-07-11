import test from 'node:test';
import assert from 'node:assert/strict';
import {
  roundToDecimals,
  applyRounding,
  normalizeDecimal,
  isNumericString
} from '../resources/js/utils/number-utils.js';

test('roundToDecimals rounds to the requested precision', () => {
  assert.equal(roundToDecimals(1.005, 2), 1.0);
  assert.equal(roundToDecimals(1.239, 2), 1.24);
  assert.equal(roundToDecimals(-1.235, 1), -1.2);
});

test('applyRounding supports every mode', () => {
  assert.equal(applyRounding(1.234, 'none', 2), 1.23);
  assert.equal(applyRounding(1.232, 'nearest5', 2), 1.25);
  assert.equal(applyRounding(1.231, 'up', 2), 1.24);
  assert.equal(applyRounding(1.239, 'truncate', 2), 1.23);
  assert.ok(Number.isNaN(applyRounding('abc')));
});

// Note: values with thousands separators (e.g. '1.234,56') come back
// unchanged — the JSDoc example overpromises. Pinned here as-is so a future
// fix is a conscious behavior change. @2026-07-09
test('normalizeDecimal converts plain comma decimals', () => {
  assert.equal(normalizeDecimal('12,5'), '12.5');
  assert.equal(normalizeDecimal('0.75'), '0.75');
  assert.equal(normalizeDecimal('1.234,56'), '1.234,56');
});

test('isNumericString accepts dot and comma decimals', () => {
  assert.ok(isNumericString('123'));
  assert.ok(isNumericString('12,5'));
  assert.ok(isNumericString('-0.75'));
  assert.ok(isNumericString('+.5'));
  assert.ok(!isNumericString('12a'));
  assert.ok(!isNumericString(''));
});
