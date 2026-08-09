'use client';

import { AuthScreen } from '../AuthScreen';

/**
 * /auth/request-access — the same switch, opened on the request pane.
 *
 * A separate route rather than a state only reachable by clicking, so the link can be
 * put in a job advert or sent to someone directly.
 */
export default function RequestAccess() {
  return <AuthScreen panel="register" />;
}
