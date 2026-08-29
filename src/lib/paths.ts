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

  /*
   * --- public site ---
   *
   * The marketing routes, declared here so the navigation has one source of truth and a
   * rename is one edit rather than a search through JSX.
   *
   * `about`, `contact`, `donate`, `getHelp`, `programmes` AND `services` RESOLVE. The rest still 404. They are listed because SiteNav names them
   * in the navigation bar. Do not treat a path being in this file as evidence that it
   * resolves; check for a directory under src/app.
   */
  getHelp: '/get-help',
  about: '/about',
  services: '/services',
  programmes: '/programmes',
  resources: '/resources',
  news: '/news',
  contact: '/contact',
  donate: '/donate',
  /**
   * Where "Start Screening" goes: the public request-for-assistance flow, in which someone
   * gives their details and asks for help. NOT the staff intake form — that is behind
   * beneficiary:create and consent is captured by an officer sitting with the person.
   */
  screening: '/screening',

  /*
   * --- the legal footer, Design.md §60 ---
   *
   * These are not decoration on a site that stores immigration status, permit numbers and
   * vulnerability flags. POPIA gives a data subject the right to know what is held and why,
   * and a privacy notice is the ordinary place that lives — so `privacy` is the one route in
   * this whole file that is arguably required rather than merely planned.
   *
   * They 404 like the rest today.
   */
  privacy: '/privacy',
  terms: '/terms',
  accessibility: '/accessibility',

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
