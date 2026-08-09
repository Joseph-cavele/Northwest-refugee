/*
 * Money is integer cents, everywhere, exactly as on the server. Every field carrying
 * an amount ends in `Cents`, and nothing in this app does arithmetic on rands.
 *
 * The reason is not pedantry. `1.005` is already 1.00499999999999989 as a double
 * before any code sees it, so a float that has been through a form, a JSON round-trip
 * and a sum is not the number anyone typed. A donor receipt that is one cent out is a
 * SARS s18A certificate that does not reconcile.
 *
 * The API accepts rands at the boundary and converts with toCents() immediately. This
 * module is the client's half of that contract: parse what a person typed into cents,
 * and format cents for display. Nothing in between.
 */

import { CURRENCY } from '@/types/enums';

/** Cents → rands, for display only. Never feed the result back into a calculation. */
export function toRands(cents: number): number {
  return cents / 100;
}

/**
 * Parse a typed amount into integer cents.
 *
 * Takes a **string**, deliberately. Accepting a number here would mean the caller has
 * already lost precision — by the time `1.005` is a JS number the third decimal is
 * gone. Reading the digits directly is exact.
 *
 * Accepts the shapes a South African user actually types: `1 234,56`, `R1,234.56`,
 * `1234.5`. Returns null for anything it cannot read, so a caller can show a field
 * error rather than silently posting a zero.
 */
export function parseCents(input: string): number | null {
  const raw = input.trim();
  if (!raw) return null;

  // Strip the currency symbol and every kind of space. The two escapes are written out
  // rather than pasted as literals: an invisible character in a character class is
  // unreviewable. U+00A0 matters because Intl.NumberFormat('en-ZA') emits it as its own
  // thousands separator, so an amount this module formatted must parse when pasted back.
  let s = raw.replace(/[R\s\u00A0\u202F]/gi, '');

  const negative = s.startsWith('-');
  if (negative) s = s.slice(1);

  // Decide which separator is the decimal point. Whichever appears last is it —
  // "1.234,56" is European, "1,234.56" is not, and both are typed here.
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  const decimalAt = Math.max(lastComma, lastDot);

  let whole: string;
  let fraction: string;
  if (decimalAt === -1) {
    whole = s;
    fraction = '';
  } else {
    whole = s.slice(0, decimalAt);
    fraction = s.slice(decimalAt + 1);
  }

  // Everything left of the decimal point that is a separator is a thousands grouping.
  whole = whole.replace(/[,.]/g, '');

  if (!/^\d*$/.test(whole) || !/^\d*$/.test(fraction)) return null;
  if (whole === '' && fraction === '') return null;
  // More than two decimals is a typo or a different currency, not an amount in rands.
  if (fraction.length > 2) return null;

  const cents = Number(whole || '0') * 100 + Number(fraction.padEnd(2, '0') || '0');
  if (!Number.isSafeInteger(cents)) return null;

  return negative ? -cents : cents;
}

/**
 * Cents → the rand string the API expects in a request body.
 *
 * A string, not a number: `"1.005"` parses to exactly 101 cents server-side, where
 * the literal `1.005` never can. Always send this, never `toRands()`.
 */
export function centsToInput(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const s = `${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
  return negative ? `-${s}` : s;
}

const zar = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: CURRENCY,
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** `formatZAR(123456)` → `R 1 234,56`. The canonical way to show money. */
export function formatZAR(cents: number): string {
  return zar.format(toRands(cents));
}

const zarCompact = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: CURRENCY,
  notation: 'compact',
  maximumFractionDigits: 1,
});

/**
 * For dashboard tiles and campaign progress bars, where the exact cents are noise.
 * Never for a receipt, a transaction row or an approval screen — someone signing off
 * on spend needs the real figure.
 */
export function formatZARCompact(cents: number): string {
  return zarCompact.format(toRands(cents));
}

/**
 * Split an amount across weights without losing a cent.
 *
 * R100 three ways is [3334, 3333, 3333], never three lots of 33.33. Mirrors
 * allocate() in src/server/utils/money.js — the largest-remainder method, with the
 * leftover cents going to the earliest entries.
 */
export function allocate(cents: number, weights: number[]): number[] {
  const total = weights.reduce((sum, w) => sum + w, 0);
  if (total <= 0) return weights.map(() => 0);

  const shares = weights.map((w) => Math.floor((cents * w) / total));
  let remainder = cents - shares.reduce((sum, s) => sum + s, 0);

  for (let i = 0; remainder > 0; i = (i + 1) % shares.length) {
    shares[i] = (shares[i] ?? 0) + 1;
    remainder -= 1;
  }
  return shares;
}

/** Percentage of a target raised, clamped to 0–100 for a progress bar's width. */
export function percentOf(cents: number, targetCents: number): number {
  if (targetCents <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((cents / targetCents) * 100)));
}
