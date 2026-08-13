import { describe, expect, it } from 'vitest';
import { blockedReason, hasIdNumber, ID_NUMBER_MESSAGE } from '@/features/chatboard/lib/guard';

/*
 * The ID-number guard on the staff board.
 *
 * These tests exist to keep the client's copy of the pattern honest against the server's.
 * A false negative here is the one that matters: it waves through a message the server
 * will refuse, so the user loses what they typed — and the retype is the version with the
 * number split across two lines, which the pattern no longer catches and the board now
 * permanently holds.
 */

describe('hasIdNumber', () => {
  it('catches a bare South African ID number', () => {
    expect(hasIdNumber('Her ID is 8801015009087, please check')).toBe(true);
  });

  it('catches one at the very start and end of a message', () => {
    expect(hasIdNumber('8801015009087')).toBe(true);
    expect(hasIdNumber('check 8801015009087')).toBe(true);
  });

  it('does not fire on a local phone number', () => {
    // Ten digits. Staff post these legitimately and constantly.
    expect(hasIdNumber('Call her on 0821234567')).toBe(false);
    expect(hasIdNumber('+27821234567 is the number')).toBe(false);
  });

  it('does not fire on an NWHR reference code', () => {
    // Alphanumeric, and the thing the message is telling people to use instead.
    expect(hasIdNumber('See NWHR-2026-PFJ7GJ for the details')).toBe(false);
    expect(hasIdNumber('Case CASE-2026-RCXBTC is with legal')).toBe(false);
  });

  it('does not fire on an ordinary sentence with numbers in it', () => {
    expect(hasIdNumber('We served 120 households across 3 sites in 2026')).toBe(false);
    expect(hasIdNumber('R12 500 was approved on 14 March')).toBe(false);
  });

  it('does not fire on a longer run of digits', () => {
    // Fourteen digits is not an ID number, and the word boundary means it is not treated
    // as one. Matching a substring here would reject legitimate reference strings.
    expect(hasIdNumber('88010150090871')).toBe(false);
  });
});

describe('blockedReason', () => {
  it('returns the server’s own wording, which says what to do instead', () => {
    expect(blockedReason('ID 8801015009087')).toBe(ID_NUMBER_MESSAGE);
    // Naming the alternative is the point — a refusal with no way forward gets worked around.
    expect(ID_NUMBER_MESSAGE).toContain('NWHR code');
  });

  it('allows an ordinary message', () => {
    expect(blockedReason('Legal clinic moved to Thursday, please tell the queue.')).toBeNull();
  });

  it('treats an empty message as nothing to send, not as an error', () => {
    // A composer should not show a complaint before anybody has typed anything.
    expect(blockedReason('')).toBeNull();
    expect(blockedReason('   ')).toBeNull();
  });
});
