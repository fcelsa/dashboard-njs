/**
 * Business math helpers — margin, markup and tax calculations.
 * All functions are pure: no side effects, no state.
 * @module engine/business-math
 */

/**
 * Compute sell price from cost and gross-margin percentage.
 * Margin (%) is treated as a percent of the sell price.
 * @param {number} cost
 * @param {number} marginPercent
 * @returns {number}
 */
export function computeSell(cost, marginPercent) {
  const m = Number(marginPercent) / 100;
  if (isNaN(cost) || isNaN(m)) return NaN;
  const denom = 1 - m;
  if (denom === 0) throw new Error('DivisionByZero');
  return Number(cost) / denom;
}

/**
 * Compute cost from sell price and gross-margin percentage.
 * @param {number} sell
 * @param {number} marginPercent
 * @returns {number}
 */
export function computeCost(sell, marginPercent) {
  const m = Number(marginPercent) / 100;
  if (isNaN(sell) || isNaN(m)) return NaN;
  return Number(sell) * (1 - m);
}

/**
 * Compute gross-margin percentage from cost and sell price.
 * @param {number} cost
 * @param {number} sell
 * @returns {number}
 */
export function computeMargin(cost, sell) {
  cost = Number(cost);
  sell = Number(sell);
  if (isNaN(cost) || isNaN(sell)) return NaN;
  if (sell === 0) throw new Error('DivisionByZero');
  return ((sell - cost) / sell) * 100;
}

/**
 * Compute markup percentage: (profit / cost) * 100.
 * @param {number} cost
 * @param {number} sell
 * @returns {number}
 */
export function computeMarkup(cost, sell) {
  cost = Number(cost);
  sell = Number(sell);
  if (isNaN(cost) || isNaN(sell)) return NaN;
  if (cost === 0) throw new Error('DivisionByZero');
  return ((sell - cost) / cost) * 100;
}

/**
 * Compute sell price from cost and markup percentage.
 * @param {number} cost
 * @param {number} markupPercent
 * @returns {number}
 */
export function computeSellFromMarkup(cost, markupPercent) {
  const m = Number(markupPercent) / 100;
  if (isNaN(cost) || isNaN(m)) return NaN;
  return Number(cost) * (1 + m);
}

/**
 * Compute cost from sell price and markup percentage.
 * @param {number} sell
 * @param {number} markupPercent
 * @returns {number}
 */
export function computeCostFromMarkup(sell, markupPercent) {
  const m = Number(markupPercent) / 100;
  if (isNaN(sell) || isNaN(m)) return NaN;
  const denom = 1 + m;
  if (denom === 0) throw new Error('DivisionByZero');
  return Number(sell) / denom;
}

/**
 * Add tax to an amount.
 * @param {number} amount
 * @param {number} ratePercent
 * @returns {number}
 */
export function addTax(amount, ratePercent) {
  const r = Number(ratePercent) / 100;
  if (isNaN(amount) || isNaN(r)) return NaN;
  return Number(amount) * (1 + r);
}

/**
 * Remove tax from a tax-inclusive amount.
 * @param {number} amountWithTax
 * @param {number} ratePercent
 * @returns {number}
 */
export function removeTax(amountWithTax, ratePercent) {
  const r = Number(ratePercent) / 100;
  if (isNaN(amountWithTax) || isNaN(r)) return NaN;
  const denom = 1 + r;
  if (denom === 0) throw new Error('DivisionByZero');
  return Number(amountWithTax) / denom;
}
