/*
 * Every route in the app, in one place.
 *
 * Two of these are NOT free choices. The backend builds invitation and password-reset
 * emails as `${APP_URL}/accept-invite?token=…` and `${APP_URL}/reset-password?token=…`
 * (src/server/modules/notifications/email.service.js). Those paths are already sitting
 * in people's inboxes, so moving them under /auth would 404 every outstanding
 * invitation — including ones sent months ago. They stay at the root.
 */

export const PATHS = {
  home: '/',

  // --- staff auth ---
  signIn: '/auth/sign-in',
  requestAccess: '/auth/request-access',
  mfa: '/auth/mfa',

  // --- reached from an email link: fixed by the server, do not move ---
  acceptInvite: '/accept-invite',
  resetPassword: '/reset-password',
  forgotPassword: '/forgot-password',

  // --- public site ---
  getHelp: '/get-help',

  /*
   * The dashboard root. The eight role landing routes under it — /dashboard/executive,
   * /dashboard/finance and so on — are NOT listed here on purpose: the server owns that
   * table (src/server/config/constants.js DASHBOARD_BY_ROLE) and sends the destination
   * with the session, and `types/enums.ts` mirrors it for a cold reload. A third copy
   * here is the one that would drift, and a landing route that drifts is a working login
   * that ends on a 404.
   */
  dashboard: '/dashboard',
} as const;

export type Path = (typeof PATHS)[keyof typeof PATHS];

/** The query parameter carrying the one-time token on both email-linked routes. */
export const TOKEN_PARAM = 'token';
