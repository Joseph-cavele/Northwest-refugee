import { describe, expect, it } from 'vitest';
import {
  familyOf,
  familyLabel,
  groupActions,
  labelOf,
  weighEntry,
} from '@/features/audit/lib/actions';

/*
 * Reading the audit vocabulary.
 *
 * The trail is mostly routine and the entries that matter are a thin minority buried in
 * it. These tests pin which minority — particularly that a successful sensitive read is
 * MORE interesting than a routine denial, which is the opposite of what a generic
 * "highlight the errors" rule would do.
 */

describe('weighEntry', () => {
  it('treats reading special personal information as a disclosure', () => {
    // Nothing went wrong here. It is written down precisely because POPIA asks NWHR to be
    // able to account for who read a permit number.
    expect(weighEntry({ action: 'beneficiary.sensitive_read', status: 'success' })).toBe(
      'DISCLOSURE'
    );
    expect(weighEntry({ action: 'document.downloaded', status: 'success' })).toBe('DISCLOSURE');
  });

  it('counts an outbound referral as a disclosure, not a case note', () => {
    // It hands a person's details to a third party.
    expect(weighEntry({ action: 'referral.created', status: 'success' })).toBe('DISCLOSURE');
  });

  it('keeps a refused sensitive read as a disclosure rather than a generic denial', () => {
    // Someone reaching for a permit number and being refused is still first and foremost a
    // record of them reaching for it. The generic denial treatment loses which record.
    expect(weighEntry({ action: 'beneficiary.sensitive_read', status: 'failure' })).toBe(
      'DISCLOSURE'
    );
  });

  it('flags the signals that an account or session may be compromised', () => {
    for (const action of [
      'auth.refresh_reuse_detected',
      'auth.account_locked',
      'auth.login_failed',
      'auth.mfa_challenge_failed',
    ]) {
      expect(weighEntry({ action, status: 'failure' })).toBe('SECURITY');
    }
  });

  it('marks any other failure as a denial', () => {
    expect(weighEntry({ action: 'finance.approved', status: 'failure' })).toBe('DENIAL');
  });

  it('leaves ordinary successful work routine', () => {
    expect(weighEntry({ action: 'beneficiary.created', status: 'success' })).toBe('ROUTINE');
    expect(weighEntry({ action: 'finance.approved', status: 'success' })).toBe('ROUTINE');
  });
});

describe('reading an action name', () => {
  it('splits the namespace the writers already agreed on', () => {
    expect(familyOf('beneficiary.sensitive_read')).toBe('beneficiary');
    expect(labelOf('beneficiary.sensitive_read')).toBe('Sensitive read');
  });

  it('survives an action with no namespace', () => {
    expect(familyOf('somethingodd')).toBe('somethingodd');
    expect(labelOf('somethingodd')).toBe('Somethingodd');
  });

  it('reads an underscored family as words', () => {
    expect(familyLabel('access_request')).toBe('Access request');
  });
});

describe('groupActions', () => {
  it('groups by family, both levels sorted', () => {
    const grouped = groupActions([
      'finance.reversed',
      'auth.login_failed',
      'finance.approved',
      'auth.logout',
    ]);

    expect(grouped).toEqual([
      { family: 'auth', actions: ['auth.login_failed', 'auth.logout'] },
      { family: 'finance', actions: ['finance.approved', 'finance.reversed'] },
    ]);
  });

  it('is built from whatever the server sends', () => {
    // A new action appears the moment it is added server-side, rather than when someone
    // remembers to update a hard-coded list here.
    const grouped = groupActions(['brandnew.thing']);
    expect(grouped).toEqual([{ family: 'brandnew', actions: ['brandnew.thing'] }]);
  });

  it('handles an empty vocabulary without throwing', () => {
    expect(groupActions([])).toEqual([]);
  });
});
