// Phone numbers are stored in E.164 (+27821234567) so the WhatsApp client, de-duplication
// lookups and outbound messaging all match on one exact string. Meta's Cloud API returns
// numbers without a '+', front-desk staff type '082 123 4567', and a referral partner
// might send '+27 (82) 123-4567' — all three must land on the same stored value or the
// same person is registered twice.

const SA_COUNTRY_CODE = '27';

/** Everything except digits and a single leading '+'. */
function stripFormatting(input) {
  return String(input ?? '')
    .trim()
    .replace(/[^\d+]/g, '')
    .replace(/(?!^)\+/g, '');
}

/**
 * Normalise to E.164. Returns null when the input cannot be interpreted, so a caller can
 * tell "not a phone number" from "a phone number I reformatted".
 *
 * Non-SA numbers are accepted as-is when already in international form. Beneficiaries
 * arrive from the DRC, Somalia, Zimbabwe and Malawi and often keep a foreign number —
 * rejecting anything that is not +27 would turn a real person away at intake.
 */
export function normalisePhone(input) {
  const cleaned = stripFormatting(input);
  if (!cleaned) return null;

  // Already international.
  if (cleaned.startsWith('+')) {
    const digits = cleaned.slice(1);
    return /^[1-9]\d{6,14}$/.test(digits) ? `+${digits}` : null;
  }

  // 0821234567 — SA national format.
  if (/^0\d{9}$/.test(cleaned)) {
    return `+${SA_COUNTRY_CODE}${cleaned.slice(1)}`;
  }

  // 0027821234567 — international prefix written the old way.
  if (/^00[1-9]\d{6,14}$/.test(cleaned)) {
    return `+${cleaned.slice(2)}`;
  }

  // 27821234567 — what the WhatsApp Cloud API sends, no '+'.
  if (/^[1-9]\d{6,14}$/.test(cleaned)) {
    return `+${cleaned}`;
  }

  return null;
}

export function isValidPhone(input) {
  return normalisePhone(input) !== null;
}

export function isSouthAfricanPhone(input) {
  const normalised = normalisePhone(input);
  return normalised !== null && normalised.startsWith(`+${SA_COUNTRY_CODE}`);
}

/**
 * Display form for SA numbers: +27821234567 → 082 123 4567. Foreign numbers are returned
 * in E.164, since guessing another country's grouping convention reads as a typo.
 */
export function formatPhone(input) {
  const normalised = normalisePhone(input);
  if (!normalised) return '';
  if (!normalised.startsWith(`+${SA_COUNTRY_CODE}`)) return normalised;

  const national = normalised.slice(1 + SA_COUNTRY_CODE.length);
  if (national.length !== 9) return normalised;
  return `0${national.slice(0, 2)} ${national.slice(2, 5)} ${national.slice(5)}`;
}

/** Meta's Cloud API identifies a chat by a bare-digit number; strip the '+' to match. */
export function toWhatsAppId(input) {
  const normalised = normalisePhone(input);
  return normalised ? normalised.slice(1) : null;
}
