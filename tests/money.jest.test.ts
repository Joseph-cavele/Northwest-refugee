import { describe, it, expect } from '@jest/globals';
import { allocate, parseCents, percentOf, toRands } from '@/lib/money';

/*
 * Money, in integer cents.
 *
 * WHY THIS FILE EXISTS. CLAUDE.md lists "integer cents, never floats" among the invariants
 * that stop this system being trustworthy to an auditor if broken, and `src/lib/money.ts`
 * had no direct test. Every other suite that touches money does so through a route or a
 * service, which means a rounding fault in here would surface as a wrong total three layers
 * away from its cause.
 *
 * `describe`, `it` and `expect` are IMPORTED rather than taken as globals, mirroring the
 * Vitest suites — which import the same three names from 'vitest'. Two reasons, and neither
 * is style: `tsc --noEmit` covers tests/ and would otherwise need `"types": ["jest"]` in
 * tsconfig, which turns the restriction on automatic @types inclusion on for the whole
 * project; and the import makes the file's runner obvious from its first line rather than
 * from its name. See jest.config.mjs for why the two suites are kept apart.
 */

describe('parseCents', () => {
  it('reads rands and returns whole cents', () => {
    expect(parseCents('100')).toBe(10_000);
    expect(parseCents('100.50')).toBe(10_050);
    expect(parseCents('0.01')).toBe(1);
  });

  it('never returns a fraction of a cent', () => {
    for (const input of ['1.005', '0.001', '33.333', '99.999']) {
      const cents = parseCents(input);
      if (cents === null) continue;
      expect(Number.isInteger(cents)).toBe(true);
    }
  });

  it('refuses what is not an amount, rather than guessing zero', () => {
    // A silent 0 is the dangerous answer here: it posts a transaction for nothing and
    // reconciles to a gap nobody can explain.
    for (const input of ['', 'abc', '--5']) {
      expect(parseCents(input)).toBeNull();
    }
  });
});

describe('toRands', () => {
  it('is the inverse of parseCents for whole amounts', () => {
    expect(toRands(10_000)).toBe(100);
    expect(toRands(10_050)).toBe(100.5);
  });

  it('leaves zero alone', () => {
    expect(toRands(0)).toBe(0);
  });
});

describe('allocate', () => {
  /*
   * THE INVARIANT THAT MATTERS: the parts must add back up to the whole, every time. A
   * split that loses a cent is a budget that will not reconcile, and the person who finds
   * it will be an auditor rather than a developer.
   */
  it('splits R100 three ways without losing a cent', () => {
    const shares = allocate(10_000, [1, 1, 1]);
    expect(shares).toEqual([3334, 3333, 3333]);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(10_000);
  });

  it('adds back up to the original for a spread of awkward amounts', () => {
    const cases: [number, number[]][] = [
      [1, [1, 1, 1]],
      [7, [1, 1, 1]],
      [99, [2, 3, 5]],
      [100_003, [1, 1, 1, 1, 1, 1, 1]],
      [123_457, [3, 1, 4, 1, 5, 9, 2, 6]],
    ];

    for (const [cents, weights] of cases) {
      const shares = allocate(cents, weights);
      expect(shares.reduce((a, b) => a + b, 0)).toBe(cents);
      expect(shares.every(Number.isInteger)).toBe(true);
    }
  });

  it('gives the leftover cents to the earliest entries', () => {
    // Documented behaviour, not an accident of the loop — largest-remainder, earliest first.
    expect(allocate(10, [1, 1, 1])).toEqual([4, 3, 3]);
  });

  it('returns zeros rather than dividing by nothing when the weights are empty', () => {
    expect(allocate(10_000, [0, 0])).toEqual([0, 0]);
  });
});

describe('percentOf', () => {
  it('clamps to 0 and 100, because it drives a progress bar’s width', () => {
    expect(percentOf(20_000, 10_000)).toBe(100);
    expect(percentOf(-500, 10_000)).toBe(0);
  });

  it('returns 0 for a target of zero rather than dividing by it', () => {
    expect(percentOf(5_000, 0)).toBe(0);
  });

  it('rounds to a whole percent', () => {
    expect(percentOf(3_333, 10_000)).toBe(33);
    expect(percentOf(6_667, 10_000)).toBe(67);
  });
});
