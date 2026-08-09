import crypto from 'node:crypto';

// Human-quotable reference codes. A beneficiary reads theirs off a slip of paper or over
// WhatsApp, so the alphabet excludes characters that are misread aloud or in handwriting:
// no I/1, no O/0, no U (heard as "you"), no S/5.
const ALPHABET = '23456789ABCDEFGHJKLMNPQRTVWXYZ';

/**
 * Random, not sequential. A sequential code would leak how many people the organisation
 * has registered — and let anyone holding one code guess their neighbour's.
 */
function randomCode(length) {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) {
    // Modulo bias here is negligible: 256 % 30 skews the first 16 symbols by <0.4%, which
    // does not meaningfully reduce the search space of a 6-symbol code.
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}

/**
 * `NWHR-2026-K7M3QP`. The year makes a code recognisable at a glance and keeps the random
 * part short enough to read out loud.
 *
 * 30^6 ≈ 729 million combinations per year, so collisions are vanishingly unlikely — but
 * "unlikely" is not "never", which is why referenceCode carries a unique index and the
 * caller must be prepared to retry on a duplicate-key error.
 */
export function beneficiaryReference(date = new Date()) {
  return `NWHR-${date.getUTCFullYear()}-${randomCode(6)}`;
}

/** Same construction for other record types: reference('DON') → `DON-2026-4KX9TA`. */
export function reference(prefix, date = new Date()) {
  return `${prefix}-${date.getUTCFullYear()}-${randomCode(6)}`;
}

export { ALPHABET as REFERENCE_ALPHABET };
