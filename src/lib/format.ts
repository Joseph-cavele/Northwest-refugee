import { formatZAR, formatZARCompact } from './money';

/*
 * Turning numbers into the strings a person reads.
 *
 * Money is not here — it lives in money.ts, because cents have rules of their own that
 * have nothing to do with presentation. This module routes to it rather than
 * reimplementing it, so there is exactly one place that knows a cent from a rand.
 */

/**
 * A count, grouped South African style: 1 284, not 1,284.
 *
 * en-ZA groups with a space, which is what a South African reader expects and what
 * formatZAR already emits — a dashboard mixing "R1 284,00" with "1,284" looks like two
 * systems bolted together.
 */
const countFormatter = new Intl.NumberFormat('en-ZA', { maximumFractionDigits: 0 });

export function formatCount(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return countFormatter.format(value);
}

/** Above this a count is abbreviated, so a tile's number never wraps mid-figure. */
const COMPACT_FROM = 100_000;

const compactCountFormatter = new Intl.NumberFormat('en-ZA', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

export type ValueUnit = 'COUNT' | 'CENTS';

/**
 * Render a dashboard figure in the unit the server counted it in.
 *
 * The unit comes over the wire precisely so this decision is never a guess: a CENTS
 * value rendered as a count reads as a hundredfold overstatement of the money, and it
 * looks entirely plausible on screen.
 */
export function formatValue(value: number, unit: ValueUnit): string {
  if (!Number.isFinite(value)) return '—';
  if (unit === 'CENTS') return formatZAR(value);
  return formatCount(value);
}

/**
 * The same, abbreviated for a tile where space is tight. Only large values are
 * shortened: "7" gains nothing from being written any other way, and an abbreviated
 * small number just looks like a rounding error.
 */
export function formatValueCompact(value: number, unit: ValueUnit): string {
  if (!Number.isFinite(value)) return '—';
  if (unit === 'CENTS') return formatZARCompact(value);
  return Math.abs(value) >= COMPACT_FROM ? compactCountFormatter.format(value) : formatCount(value);
}

/**
 * Sentence-case a CONSTANT_CASE wire value as a last resort.
 *
 * For anything with a label map in types/enums.ts, use the map — it carries South
 * African English and the organisation's own wording. This is for a value that arrives
 * without one, where "UNDER_REVIEW" on screen is worse than an imperfect guess.
 */
export function humanise(value: string): string {
  const words = value.toLowerCase().replace(/_/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * A file size someone can read: `248 KB`, `1,4 MB`.
 *
 * Decimal units, not binary. A scan the operating system calls 1,4 MB must not appear here
 * as 1,3 MiB — the person checking whether the right file was uploaded is comparing against
 * what their file manager told them, not against a definition of a megabyte.
 */
const SIZE_UNITS = ['bytes', 'KB', 'MB', 'GB'] as const;

export function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '—';
  if (value < 1000) return `${value} bytes`;

  let size = value;
  let unit = 0;
  while (size >= 1000 && unit < SIZE_UNITS.length - 1) {
    size /= 1000;
    unit += 1;
  }
  // One decimal below 10 (1,4 MB), none above (248 KB) — precision where it distinguishes.
  const rendered = new Intl.NumberFormat('en-ZA', {
    maximumFractionDigits: size < 10 ? 1 : 0,
  }).format(size);
  return `${rendered} ${SIZE_UNITS[unit]}`;
}

/** Trim to a length that fits, breaking on a word rather than mid-syllable. */
export function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  const cut = value.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}
