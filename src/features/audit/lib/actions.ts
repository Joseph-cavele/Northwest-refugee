/*
 * Reading the audit vocabulary.
 *
 * There are about seventy actions and they are already namespaced — `beneficiary.
 * sensitive_read`, `auth.login_failed`, `finance.approved`. That structure is real and the
 * screen uses it: a flat dropdown of seventy strings is not a filter anybody operates, and
 * inventing a second grouping when the writers already agreed on one would drift.
 *
 * WHAT AN AUDITOR IS ACTUALLY LOOKING FOR. A trail is mostly routine, and the entries that
 * matter are a thin minority buried in it. Three kinds stand out, and none of them is
 * "everything that failed":
 *
 *   DISCLOSURE  someone read special personal information, or sent it onward. These are
 *               ordinary successful actions — nothing is wrong — and they are precisely
 *               what POPIA asks NWHR to be able to account for. A permit number read is
 *               written as an audit entry for exactly this reason.
 *   SECURITY    a signal that an account may be under attack or a token stolen.
 *   DENIAL      someone attempted something their role does not permit.
 *
 * A denial is not automatically the interesting one. One person mistyping a URL produces a
 * denial; a stolen refresh token produces one refresh-reuse entry that matters far more.
 */

/** Actions that record special personal information being read or passed on. */
const DISCLOSURE_ACTIONS = new Set([
  'beneficiary.sensitive_read',
  'document.downloaded',
  // An outbound referral is a disclosure to a third party, not merely a case note — which
  // is why the service writes it as an auditable event in its own right.
  'referral.created',
]);

/** Signals that an account or a session may be compromised. */
const SECURITY_ACTIONS = new Set([
  'auth.refresh_reuse_detected',
  'auth.account_locked',
  'auth.login_failed',
  'auth.mfa_challenge_failed',
  'auth.permission_denied',
  'auth.session_revoked',
  'auth.password_reset_requested',
]);

export type EntryWeight = 'DISCLOSURE' | 'SECURITY' | 'DENIAL' | 'ROUTINE';

/**
 * How much attention this entry warrants.
 *
 * Disclosure wins over a failure status: a sensitive read that was refused is still first
 * and foremost a record of someone trying to reach a permit number, and burying it under
 * the generic "denied" treatment loses which record they were reaching for.
 */
export function weighEntry({ action, status }: { action: string; status: string }): EntryWeight {
  if (DISCLOSURE_ACTIONS.has(action)) return 'DISCLOSURE';
  if (SECURITY_ACTIONS.has(action)) return 'SECURITY';
  if (status === 'failure') return 'DENIAL';
  return 'ROUTINE';
}

/** The namespace an action belongs to: `beneficiary.sensitive_read` → `beneficiary`. */
export function familyOf(action: string): string {
  const dot = action.indexOf('.');
  return dot === -1 ? action : action.slice(0, dot);
}

/** `beneficiary.sensitive_read` → `Sensitive read`. The family is shown separately. */
export function labelOf(action: string): string {
  const dot = action.indexOf('.');
  const tail = dot === -1 ? action : action.slice(dot + 1);
  const words = tail.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** `access_request` → `Access request`. For a family heading. */
export function familyLabel(family: string): string {
  const words = family.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Group the vocabulary for a filter, families in alphabetical order and actions within
 * each. Built from whatever the server sends, so a new action appears here the moment it
 * is added rather than when someone remembers to update a list.
 */
export function groupActions(actions: string[]): { family: string; actions: string[] }[] {
  const families = new Map<string, string[]>();

  for (const action of actions) {
    const family = familyOf(action);
    const bucket = families.get(family);
    if (bucket) bucket.push(action);
    else families.set(family, [action]);
  }

  return [...families.entries()]
    .map(([family, list]) => ({ family, actions: [...list].sort() }))
    .sort((a, b) => a.family.localeCompare(b.family));
}
