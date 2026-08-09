import { api } from './client';
import type { User } from '@/types/models';
import type { Role } from '@/types/enums';

/*
 * The /auth endpoints, typed.
 *
 * The only module that knows these URLs and payload shapes. A screen importing
 * `login()` cannot get the path wrong, and when a route moves there is one edit.
 */

/** Returned by every path that completes a sign-in: login, MFA verify, invite acceptance. */
export interface Session {
  user: User;
  /**
   * Short-lived JWT. Belongs in memory owned by the auth context and nowhere else —
   * localStorage and sessionStorage are blocked by an eslint rule for this reason.
   */
  accessToken: string;
  /**
   * Where to land this person. Sent by the server so the client keeps no copy of the
   * role-to-route table. A landing route, NOT an authorisation decision: every
   * dashboard's data is permission-guarded server-side, so editing it client-side buys
   * a different empty screen and a string of 403s.
   */
  dashboard: string;
}

/** Password stage passed, TOTP still owed. Exchange the challenge on the MFA screen. */
export interface MfaChallenge {
  mfaRequired: true;
  challengeToken: string;
}

export type LoginResponse = Session | MfaChallenge;

export function isMfaChallenge(res: LoginResponse): res is MfaChallenge {
  return 'mfaRequired' in res;
}

/*
 * `anonymous: true` on every credential endpoint below.
 *
 * These run with no session, so attaching a stale Bearer token is pointless — and
 * without it a 401 from a wrong password would trigger the client's refresh-and-retry,
 * quietly submitting the same bad password twice and burning two of the five attempts
 * before the account locks.
 */
const ANON = { anonymous: true } as const;

/**
 * Unknown accounts, wrong passwords and inactive accounts all fail identically, by
 * design — the UI must not try to be more helpful than the server. Five failures lock
 * the account.
 */
export function login(email: string, password: string): Promise<LoginResponse> {
  return api.post<LoginResponse>('/auth/login', { email, password }, ANON);
}

export function verifyMfa(challengeToken: string, code: string): Promise<Session> {
  return api.post<Session>('/auth/mfa/verify', { challengeToken, code }, ANON);
}

/** Redeems the one-time invite token, sets the first password, and signs the user in. */
export function acceptInvite(token: string, password: string): Promise<Session> {
  return api.post<Session>('/auth/accept-invite', { token, password }, ANON);
}

/** Always succeeds, whether or not the address exists. Do not branch on the result. */
export function forgotPassword(email: string): Promise<{ message: string }> {
  return api.post<{ message: string }>('/auth/forgot-password', { email }, ANON);
}

export function resetPassword(token: string, password: string): Promise<{ message: string }> {
  return api.post<{ message: string }>('/auth/reset-password', { token, password }, ANON);
}

// --- session ------------------------------------------------------------------------

/** The signed-in user, with `departmentId` populated on this path only. */
export function getMe(signal?: AbortSignal): Promise<{ user: User; dashboard: string }> {
  return api.get<{ user: User; dashboard: string }>('/auth/me', { signal });
}

/**
 * Revoke the current refresh token and clear the cookie. Works with or without a valid
 * access token, which matters: signing out of an already-expired session must still
 * clear the cookie rather than fail.
 */
export function logout(): Promise<{ message: string }> {
  return api.post<{ message: string }>('/auth/logout', undefined, ANON);
}

/** Revoke every session and bump tokenVersion, invalidating outstanding access tokens. */
export function logoutAll(): Promise<{ message: string }> {
  return api.post<{ message: string }>('/auth/logout-all');
}

// --- access requests ---------------------------------------------------------------

/** What the public request-access form needs. EXECUTIVE_DIRECTOR is excluded server-side. */
export interface AccessRequestOptions {
  departments: { id: string; name: string; slug: string }[];
  roles: { value: Role; label: string }[];
}

export function getAccessRequestOptions(signal?: AbortSignal): Promise<AccessRequestOptions> {
  return api.get<AccessRequestOptions>('/auth/access-requests/options', { signal });
}

export interface AccessRequestPayload {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  requestedRole: string;
  departmentId: string;
  motivation: string;
}

/**
 * Submit a request for a staff account.
 *
 * Returns the same acknowledgement on every path — unknown address, existing staff
 * member, or duplicate pending request. That is deliberate: varying the response would
 * turn the form into an oracle for who works here. Do not "improve" the UI by telling
 * the user their email is already registered.
 */
export function submitAccessRequest(payload: AccessRequestPayload): Promise<{ message: string }> {
  return api.post<{ message: string }>('/auth/access-requests', payload);
}
