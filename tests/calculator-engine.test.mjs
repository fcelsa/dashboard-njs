import test from 'node:test';
import assert from 'node:assert/strict';
import { CalculatorEngine } from '../resources/js/calculator-engine.js';

function press(engine, keys) {
  for (const key of keys) {
    engine.pressKey(key);
  }
}

test('addition produces a result entry', () => {
  const engine = new CalculatorEngine();
  press(engine, ['2', '+', '3', '=']);
  assert.equal(Number(engine.currentInput), 5);
  const result = engine.entries.at(-1);
  assert.equal(result.type, 'result');
  assert.equal(Number(result.roundingRawValue), 5);
});

test('multiplication and division chain', () => {
  const engine = new CalculatorEngine();
  press(engine, ['1', '0', 'x', '4', '=']);
  assert.equal(Number(engine.currentInput), 40);

  const divide = new CalculatorEngine();
  press(divide, ['9', '÷', '3', '=']);
  assert.equal(Number(divide.currentInput), 3);
});

test('undo restores the previous state', () => {
  const engine = new CalculatorEngine();
  press(engine, ['5', '+', '5', '=']);
  const entriesAfterResult = engine.entries.length;
  engine.undo();
  assert.ok(engine.entries.length < entriesAfterResult);
});
