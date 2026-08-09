import { redirect } from 'next/navigation';
import { PATHS } from '@/lib/paths';

/*
 * `/` — the staff entry point.
 *
 * A server-side redirect, so a signed-out visitor never downloads the app just to be sent
 * somewhere else. RequireAuth returns a signed-in user to their dashboard from the sign-in
 * screen, which is the one place that knows whether there is a session.
 *
 * The public marketing site is not built yet; when it is, it takes this route and the
 * staff entry moves entirely behind /auth.
 */
export default function Home() {
  redirect(PATHS.signIn);
}
