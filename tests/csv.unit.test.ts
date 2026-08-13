import { describe, expect, it } from 'vitest';
import { csvAmount, csvCell, toCsv, UTF8_BOM } from '@/lib/csv';

/*
 * The money export.
 *
 * Both rules here fail in somebody else's application rather than in this one, which is
 * exactly why they need testing: a broken export looks perfect on screen and goes wrong
 * once a finance officer opens it in Excel.
 */

describe('csvCell', () => {
  it('neutralises a cell that a spreadsheet would run as a formula', () => {
    // Reachable: payees and donor names are typed by staff, and the access-request form is
    // public. A leading apostrophe makes the rest literal and is not itself displayed.
    for (const attack of ['=1+1', '+1', '-1', '@SUM(A1)']) {
      expect(csvCell(attack)).toBe(`"'${attack}"`);
    }
  });

  it('leaves an ordinary value alone', () => {
    expect(csvCell('Shoprite Rustenburg')).toBe('"Shoprite Rustenburg"');
    expect(csvCell('OPS-01')).toBe('"OPS-01"');
  });

  it('escapes quotes, commas and newlines rather than breaking the row', () => {
    expect(csvCell('He said "yes"')).toBe('"He said ""yes"""');
    expect(csvCell('Food parcels, winter')).toBe('"Food parcels, winter"');
    expect(csvCell('line one\nline two')).toBe('"line one\nline two"');
  });

  it('renders nothing for a missing value', () => {
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
  });

  it('does not treat a negative NUMBER as an attack — it is an amount', () => {
    // The guard is about text. Numbers go through csvAmount, which is tested below.
    expect(csvCell(-5)).toBe(`"'-5"`);
    expect(csvAmount(-500)).toBe('-5.00');
  });
});

describe('csvAmount', () => {
  it('renders integer cents as a plain decimal a spreadsheet can total', () => {
    // Not "R 1 234,56" — correct on screen, unparseable as a number anywhere else.
    expect(csvAmount(123_456)).toBe('1234.56');
    expect(csvAmount(100)).toBe('1.00');
    expect(csvAmount(5)).toBe('0.05');
    expect(csvAmount(0)).toBe('0.00');
  });

  it('keeps the sign on a negative amount', () => {
    // An overspent budget line is the case that produces one.
    expect(csvAmount(-150_000)).toBe('-1500.00');
  });

  it('never loses a cent to floating point', () => {
    expect(csvAmount(1_000_000_01)).toBe('1000000.01');
    expect(csvAmount(999)).toBe('9.99');
  });

  it('renders nothing rather than NaN', () => {
    expect(csvAmount(Number.NaN)).toBe('');
  });
});

describe('toCsv', () => {
  it('joins rows with CRLF and opens with a BOM', () => {
    const csv = toCsv([
      ['Code', 'Amount (ZAR)'],
      ['OPS-01', '1234.56'],
    ]);
    // The BOM is what makes Excel read the file as UTF-8 rather than the system codepage —
    // without it every accented name in this register arrives mangled.
    expect(csv.startsWith(UTF8_BOM)).toBe(true);
    expect(UTF8_BOM.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('"Code","Amount (ZAR)"\r\n"OPS-01","1234.56"');
  });

  it('handles an empty export without producing a broken file', () => {
    expect(toCsv([])).toBe(`${UTF8_BOM}\r\n`);
  });
});
