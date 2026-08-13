/*
 * The one rule the staff board enforces on what may be written in it.
 *
 * THE BOARD IS NOT A CASE-NOTES SYSTEM. Anything about a specific person belongs on that
 * person's record, where it inherits row-level scoping and the audit trail. A message here
 * is visible to everyone in the channel, is scoped to no caseload, and has no
 * sensitive-read entry behind it — so a South African ID number pasted into chat has
 * escaped every control the rest of the system applies to exactly that number.
 *
 * The server refuses it. This mirrors the refusal so someone finds out WHILE TYPING rather
 * than after pressing send: a 4000-character message bounced back with a validation error
 * is a message people retype with the number split across two lines, which defeats the
 * rule and teaches them the system is an obstacle.
 *
 * THE PATTERN IS COPIED EXACTLY from chatboard.schema.js. If the two drift, the composer
 * either nags about text the server accepts or waves through text it refuses — and the
 * second is the one that matters. Change them together.
 */

/**
 * A South African ID number is thirteen consecutive digits.
 *
 * Word boundaries on both sides so a local phone number (ten digits) and an NWHR reference
 * code (alphanumeric) do not collide with it. A longer run of digits does not match either
 * — deliberately, since it is not an ID number.
 */
const SA_ID_NUMBER = /\b\d{13}\b/;

/** The server's own wording. It says what to do instead, not merely what is forbidden. */
export const ID_NUMBER_MESSAGE =
  'Do not post ID or permit numbers on the chatboard — reference the beneficiary by their NWHR code instead';

/** True when the body carries something that looks like an ID number. */
export function hasIdNumber(body: string): boolean {
  return SA_ID_NUMBER.test(body);
}

/**
 * Why this message cannot be sent, or null when it can.
 *
 * Returns the reason rather than a boolean so a composer can render one line and stay in
 * step with the server as more rules arrive.
 */
export function blockedReason(body: string): string | null {
  if (body.trim().length === 0) return null; // Empty is not an error, just nothing to send.
  if (hasIdNumber(body)) return ID_NUMBER_MESSAGE;
  return null;
}
