/*
 * Building a CSV that a spreadsheet will open safely and read correctly.
 *
 * TWO HAZARDS, AND NEITHER IS COSMETIC.
 *
 * FORMULA INJECTION. A spreadsheet treats a cell beginning with =, +, - or @ as a formula.
 * A donor named "=cmd|'/c calc'!A1" — or, far more likely, a payee typed with a leading
 * minus — becomes executable content in Excel the moment a finance officer opens the
 * export. The values in this system are typed by staff and by the public access-request
 * form, so this is reachable. Every text field is neutralised below.
 *
 * DECIMAL SEPARATORS. The app renders money South African style — "R 1 234,56" — which is
 * right on screen and unparseable as a number in a spreadsheet set to any other locale.
 * Amounts therefore leave here as plain `1234.56`: no symbol, no grouping, a dot. The
 * column heading carries the currency instead. An export whose figures arrive as text is
 * an export nobody can total, which is the one thing a finance officer wants to do with it.
 */

/** Cells opening with any of these are read as a formula by Excel, Sheets and Calc. */
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

/**
 * One cell, quoted and neutralised.
 *
 * A leading apostrophe is the conventional defusing: spreadsheets treat the rest as literal
 * text and do not display the apostrophe itself. It is applied before quoting so the guard
 * survives the escaping.
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';

  const raw = String(value);
  const safe = FORMULA_PREFIX.test(raw) ? `'${raw}` : raw;

  // Always quoted: a payee containing a comma, a note containing a newline, and a
  // description containing a quotation mark are all ordinary here.
  return `"${safe.replace(/"/g, '""')}"`;
}

/** Integer cents → the plain decimal a spreadsheet can add up. Never a formatted string. */
export function csvAmount(cents: number): string {
  if (!Number.isFinite(cents)) return '';
  const negative = cents < 0;
  const abs = Math.abs(Math.round(cents));
  return `${negative ? '-' : ''}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/**
 * Rows into a CSV document.
 *
 * CRLF line endings, because Excel on Windows is the overwhelmingly likely destination and
 * it is the only common reader that still cares. A BOM is prepended so Excel reads the file
 * as UTF-8 rather than as the system codepage — without it, every accented name in the
 * register arrives mangled, and this register is full of them.
 */
/**
 * U+FEFF, built from its code point rather than pasted into the source.
 *
 * An invisible character in a source file is unreviewable — you cannot see it in a diff,
 * and the linter is right to refuse one. Naming it here also makes the export testable
 * without a test file that contains the same invisible character.
 */
export const UTF8_BOM = String.fromCharCode(0xfeff);

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  const body = rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
  return `${UTF8_BOM}${body}\r\n`;
}

/**
 * Hand a generated file to the browser.
 *
 * An object URL rather than a data URI: data URIs are capped at a few megabytes in some
 * browsers, and a year of transactions passes that. The URL is revoked immediately after
 * the click — it points at memory, and leaving it alive keeps the whole file there.
 */
export function downloadFile(filename: string, contents: string, mime = 'text/csv'): void {
  const blob = new Blob([contents], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();

  URL.revokeObjectURL(url);
}
