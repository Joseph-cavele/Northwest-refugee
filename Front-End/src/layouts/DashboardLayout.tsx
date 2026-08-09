import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

/*
 * The shell every signed-in screen sits inside: navigation, the session bar, and the
 * outlet the module renders into.
 *
 * Mounted under RequireAuth, so by the time this renders the session has resolved and
 * `user` is real — no null-checking the user on every dashboard screen.
 *
 * The sidebar is permanent from `lg` up and a drawer below it. A fixed 15rem rail on a
 * 360px phone leaves about 140px for a beneficiary table, and intake is done on phones.
 */

export function DashboardLayout() {
  /*
   * The drawer is closed by the thing that opens a page — Sidebar's `onNavigate`, fired
   * by the link the user tapped — rather than by an effect watching the location. An
   * effect would be a synchronous setState on every navigation, including the ones where
   * the drawer was never open, to handle a case the click handler already covers.
   */
  const [navOpen, setNavOpen] = useState(false);

  return (
    <div className="min-h-screen bg-canvas">
      {/*
        * Styled by `.skip-link` in globals.css: off-screen until focused. The dashboard
        * is keyboard-driven — register capture and the approval queue especially — and
        * without this every page starts by tabbing through the whole nav.
        */}
      <a href="#main" className="skip-link">
        Skip to content
      </a>

      <div className="flex">
        <div className="fixed inset-y-0 left-0 hidden lg:block">
          <Sidebar />
        </div>

        {navOpen && (
          <div className="fixed inset-0 z-30 lg:hidden">
            {/*
              * A real <button>, not a div with onClick: tapping outside to dismiss has to
              * be reachable by keyboard and announced, or the drawer is a trap.
              */}
            <button
              type="button"
              onClick={() => setNavOpen(false)}
              className="absolute inset-0 size-full bg-ink-950/40"
            >
              <span className="sr-only">Close navigation</span>
            </button>
            <div className="relative h-full shadow-lg">
              <Sidebar onNavigate={() => setNavOpen(false)} />
            </div>
          </div>
        )}

        <div className="flex min-h-screen w-full flex-col lg:pl-sidebar">
          <TopBar onOpenNav={() => setNavOpen(true)} />
          <main id="main" className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
            <div className="mx-auto w-full max-w-content">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

export default DashboardLayout;
