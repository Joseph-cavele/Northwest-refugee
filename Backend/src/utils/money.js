import { CURRENCY } from '../config/constants.js';

// Money is integer cents everywhere inside this system. Floats are not merely imprecise
// here, they are wrong in a way that surfaces at audit: 0.1 + 0.2 is 0.30000000000000004,
// and a ledger that does that a few thousand times no longer reconciles.
//
// The boundary rule:
//   in   — zod accepts rands from the client, the service calls toCents() immediately;
//   out  — toRands() or formatZAR(), and nowhere else.
// Between those two points a rand value should never exist.

// ~R90 trillion. Beyond Number.MAX_SAFE_INTEGER integer arithmetic silently stops being
// exact, which is the one failure mode this module exists to prevent — so it is refused
// rather than allowed to round.
export const MAX_CENTS = Number.MAX_SAFE_INTEGER;

const CENTS_PER_RAND = 100;

/** True for a value that is a usable amount in cents. */
export function isCents(value) {
  return Number.isSafeInteger(value);
}

export function assertCents(value, label = 'amount') {
  if (!isCents(value)) {
    throw new TypeError(`${label} must be an integer number of cents, received: ${String(value)}`);
  }
  return value;
}

// --- parsing ---------------------------------------------------------------------

/**
 * Normalise a human-typed amount to a plain decimal string.
 *
 * South African users type "R1 234,56" — comma decimal, space thousands — while an API
 * client sends "1234.56". Both must land on the same number, and "1,234" must not become
 * 1.234 because someone used a US-style thousands separator.
 */
function normaliseDecimalString(input) {
  let s = String(input).trim();
  if (s === '') throw new TypeError('Amount is empty');

  // Currency symbol, ordinary spaces, and the non-breaking space Intl emits.
  // \s already matches U+00A0 and U+202F, the spaces Intl and copy-paste produce.
  s = s.replace(/^R\s*/i, '').replace(/\s/g, '');

  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');

  if (lastComma !== -1 && lastDot !== -1) {
    // Whichever comes last is the decimal separator; the other groups thousands.
    if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (lastComma !== -1) {
    // A lone comma is a decimal separator only if it is followed by 1-2 digits at the end
    // ("1234,5"). Otherwise it groups thousands ("1,234" is one thousand, not 1.234).
    s = /,\d{1,2}$/.test(s) ? s.replace(',', '.') : s.replace(/,/g, '');
  }

  if (!/^-?\d+(\.\d+)?$/.test(s)) {
    throw new TypeError(`Not a valid amount: ${String(input)}`);
  }
  return s;
}

/**
 * Exact string → cents, with half-up rounding away from zero on the third decimal.
 * Done by shifting the decimal point rather than multiplying, so no float is involved
 * and "1.005" really does become 101 cents.
 */
function decimalStringToCents(s) {
  const negative = s.startsWith('-');
  const [whole, fraction = ''] = (negative ? s.slice(1) : s).split('.');

  const padded = `${fraction}000`.slice(0, 3);
  const centsPart = Number(padded.slice(0, 2));
  const roundingDigit = Number(padded[2]);

  let cents = Number(whole) * CENTS_PER_RAND + centsPart;
  if (roundingDigit >= 5) cents += 1;

  if (!Number.isSafeInteger(cents)) {
    throw new RangeError(`Amount is too large to represent exactly: ${s}`);
  }
  return negative ? -cents : cents;
}

/**
 * Convert an amount in rands to integer cents.
 *
 * PREFER STRINGS. A JavaScript number cannot represent every two-decimal value: the
 * literal 1.005 is already 1.00499999999999989 by the time this function sees it, and no
 * arithmetic can recover the intended 101 cents. A tiny correction is applied to undo
 * representation error (19.99 * 100 is 1998.9999999999998), but a string is the only
 * input that is exact by construction.
 */
export function toCents(amount) {
  if (typeof amount === 'string') {
    return decimalStringToCents(normaliseDecimalString(amount));
  }

  if (typeof amount !== 'number' || !Number.isFinite(amount)) {
    throw new TypeError(`Not a valid amount: ${String(amount)}`);
  }

  // The epsilon is in cents-space and only bridges representation error — it is far too
  // small to pull a genuine 1.00499 up to 101.
  const scaled = amount * CENTS_PER_RAND;
  const cents = Math.round(scaled + Math.sign(scaled) * 1e-9);

  if (!Number.isSafeInteger(cents)) {
    throw new RangeError(`Amount is too large to represent exactly: ${amount}`);
  }
  return cents;
}

// --- formatting ------------------------------------------------------------------

/**
 * Cents → a number of rands, for JSON that a client will do its own formatting on.
 * Lossy by nature — never feed the result back into a calculation, convert it back with
 * toCents() first.
 */
export function toRands(cents) {
  assertCents(cents);
  return cents / CENTS_PER_RAND;
}

const zarFormatter = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: CURRENCY,
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Cents → "R 1 234,56". South African convention: comma decimal, space thousands.
 *
 * Intl uses a narrow no-break space as the group separator, which is correct on screen but
 * breaks naive string comparison in tests and CSV exports — `plain: true` swaps it for an
 * ordinary space.
 */
export function formatZAR(cents, { plain = false } = {}) {
  assertCents(cents);
  const formatted = zarFormatter.format(cents / CENTS_PER_RAND);
  // U+00A0 / U+202F are what Intl emits as the group separator.
  return plain ? formatted.replace(/[\u00A0\u202F]/g, ' ') : formatted;
}

/** "1 234,56" — the same number without the currency symbol, for table columns. */
export function formatAmount(cents, { plain = true } = {}) {
  return formatZAR(cents, { plain }).replace(/^(-?)R\s*/, '$1');
}

// --- arithmetic ------------------------------------------------------------------
// Every operation validates and re-checks the safe-integer bound, because an overflow
// here would be silent and would only be noticed when a reconciliation failed.

export function addCents(...amounts) {
  const total = amounts.reduce((acc, value) => acc + assertCents(value), 0);
  if (!Number.isSafeInteger(total)) throw new RangeError('Sum exceeds the safe integer range');
  return total;
}

export function subtractCents(a, b) {
  return addCents(assertCents(a), -assertCents(b));
}

export function sumCents(amounts = []) {
  return addCents(...amounts);
}

/**
 * Multiply by a plain factor — a quantity, or a rate such as 0.15 for VAT. Rounds half-up
 * away from zero, so a 15% share of an odd amount does not silently favour one side.
 */
export function multiplyCents(cents, factor) {
  assertCents(cents);
  if (typeof factor !== 'number' || !Number.isFinite(factor)) {
    throw new TypeError(`Factor must be a finite number, received: ${String(factor)}`);
  }
  const product = cents * factor;
  const result = Math.round(Math.abs(product) + 1e-9) * Math.sign(product);
  if (!Number.isSafeInteger(result)) throw new RangeError('Product exceeds the safe integer range');
  return result === 0 ? 0 : result;
}

export function percentOf(cents, percent) {
  return multiplyCents(cents, percent / 100);
}

/**
 * Split an amount across weights without losing or inventing a cent.
 *
 * Rounding each share independently does not add back up — R100 split three ways gives
 * 33.33 × 3 = R99.99, and the missing cent turns into a reconciliation query. This uses
 * the largest-remainder method: floor every share, then hand the remaining cents to the
 * shares with the biggest fractional parts, one each.
 *
 *   allocate(10000, [1, 1, 1]) → [3334, 3333, 3333]
 */
export function allocate(cents, weights) {
  assertCents(cents);
  if (!Array.isArray(weights) || weights.length === 0) {
    throw new TypeError('Weights must be a non-empty array');
  }
  if (weights.some((w) => typeof w !== 'number' || !Number.isFinite(w) || w < 0)) {
    throw new TypeError('Weights must be finite, non-negative numbers');
  }

  const totalWeight = weights.reduce((a, b) => a + b, 0);
  if (totalWeight <= 0) throw new TypeError('Weights must sum to more than zero');

  const sign = cents < 0 ? -1 : 1;
  const magnitude = Math.abs(cents);

  const exact = weights.map((w) => (magnitude * w) / totalWeight);
  const shares = exact.map(Math.floor);
  let remainder = magnitude - shares.reduce((a, b) => a + b, 0);

  // Biggest fractional part first; ties go to the earlier weight so the result is stable
  // for identical inputs rather than depending on sort implementation.
  const order = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);

  for (let i = 0; remainder > 0; i += 1, remainder -= 1) {
    shares[order[i % order.length].index] += 1;
  }

  return shares.map((share) => share * sign);
}

/** Direction is carried by a transaction's type, never by the sign of its amount. */
export function isPositiveAmount(cents) {
  return isCents(cents) && cents > 0;
}
