'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bell, LogOut, Menu, PanelLeftClose, PanelLeftOpen, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/auth/useAuth';
import { useApi } from '@/hooks/useApi';
import { PERMISSIONS } from '@/auth/permissions';
import { PATHS } from '@/lib/paths';
import { ROLE_LABELS } from '@/types/enums';
import { listNotifications, unreadCount } from '@/api/notifications.api';
import { NotificationsPanel } from '@/features/notifications/NotificationsPanel';
import { TopBarSearch } from './TopBarSearch';
import { FullscreenToggle } from './FullscreenToggle';

/*
 * The bar above the content: collapse the nav, find someone, see what needs you, get out.
 *
 * Modelled on the reference template's topbar, minus the two controls that would be
 * decoration here:
 *
 *   dark mode    globals.css leaves the dark palette deliberately undefined — "a
 *                half-tested dark palette on a screen full of status colours is worse than
 *                none" — so the switch would toggle nothing.
 *   a workspace  the template's "Projects" dropdown switches between tenants. NWHR is one
 *   dropdown     organisation; a picker with one entry teaches nothing.
 *
 * A control that does nothing is worse than an absent one: it costs a tap to find that out,
 * and on a shared front-desk machine that tap is spent by someone with a queue behind them.
 */

const ICON_BUTTON = cn(
  'grid size-9 shrink-0 place-items-center rounded-lg text-muted transition-colors',
  'hover:bg-ink-50 hover:text-body'
);

export interface TopBarProps {
  /** Opens the nav drawer on small screens. */
  onOpenNav?: () => void;
  /** Collapses the permanent sidebar to an icon rail from `lg` up. */
  onToggleCollapse?: () => void;
  collapsed?: boolean;
  /** The page's own name. Omitted where the page already carries its own header. */
  title?: string;
}

export function TopBar({ onOpenNav, onToggleCollapse, collapsed = false, title }: TopBarProps) {
  const { user, can, signOut } = useAuth();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLDivElement>(null);

  // Notifications are always the caller's own, so this needs no permission.
  const { data: unread } = useApi(useCallback((signal: AbortSignal) => unreadCount(signal), []));
  // The endpoint is paginated; the dropdown wants the rows, not the totals.
  const { data: notifications } = useApi(
    useCallback(
      (signal: AbortSignal) => listNotifications({ limit: 6 }, signal).then((page) => page.data),
      []
    )
  );

  useEffect(() => {
    if (!menuOpen && !bellOpen) return;
    function onPointerDown(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
      if (!bellRef.current?.contains(event.target as Node)) setBellOpen(false);
    }
    function onEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      setMenuOpen(false);
      setBellOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onEscape);
    };
  }, [menuOpen, bellOpen]);

  async function handleSignOut() {
    setSigningOut(true);
    /*
     * signOut() is best-effort server-side and never rejects — it clears the local session
     * whatever the network did. Staying on a dashboard because logout could not reach the
     * server is the wrong way round on a shared machine.
     */
    await signOut();
    router.replace(PATHS.signIn);
  }

  const count = unread?.unread ?? 0;
  const initials = (user?.name ?? '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

  const CollapseIcon = collapsed ? PanelLeftOpen : PanelLeftClose;

  return (
    <header
      className={cn(
        'sticky top-0 z-20 flex h-topbar items-center gap-2 border-b border-line',
        'bg-surface/95 px-3 backdrop-blur supports-backdrop-filter:bg-surface/80 sm:px-4'
      )}
    >
      {/* Two controls, one job each: the drawer below lg, the rail above it. The template
          uses one hamburger for both, which leaves it ambiguous on a tablet. */}
      <button type="button" onClick={onOpenNav} className={cn(ICON_BUTTON, 'lg:hidden')}>
        <Menu className="size-5" aria-hidden="true" />
        <span className="sr-only">Open navigation</span>
      </button>

      {onToggleCollapse && (
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-pressed={collapsed}
          className={cn(ICON_BUTTON, 'hidden lg:grid')}
        >
          <CollapseIcon className="size-5" aria-hidden="true" />
          <span className="sr-only">{collapsed ? 'Expand navigation' : 'Collapse navigation'}</span>
        </button>
      )}

      {title && (
        <h1 className="hidden shrink-0 truncate text-base font-semibold text-body md:block">
          {title}
        </h1>
      )}

      {/* Centred, as in the reference. Offered only to roles that may read the register —
          the results come from it, and a search that can never find anything is a broken
          control, not a safe one. */}
      {can(PERMISSIONS.BENEFICIARY_READ) ? (
        <TopBarSearch className="mx-auto w-full max-w-lg" />
      ) : (
        <div className="flex-1" />
      )}

      <div className="flex shrink-0 items-center gap-1">
        <FullscreenToggle className={cn(ICON_BUTTON, 'hidden sm:grid')} />

        {/*
          * The bell OPENS something. A badge counting unread work above a button that does
          * nothing tells a person there is work and then refuses to show it.
          *
          * The panel shows the most recent few and ends in a way through to the full list,
          * where they can be cleared. It deliberately does NOT mark anything read itself:
          * glancing at a dropdown is not reading, and a bell that empties because somebody
          * opened it is a bell that has lost the thing it was counting.
          */}
        <div ref={bellRef} className="relative">
          <button
            type="button"
            onClick={() => setBellOpen((open) => !open)}
            aria-expanded={bellOpen}
            aria-haspopup="dialog"
            className={cn(ICON_BUTTON, 'relative')}
          >
            <Bell className="size-5" aria-hidden="true" />
            {count > 0 && (
              <>
                {/*
                  * The dot is the glance, the number is the fact. White on brand-500 is
                  * 7.3:1; the logo's orange would be 2.6:1 and fails outright here.
                  */}
                <span className="absolute top-0.5 right-0.5 grid min-w-4 place-items-center rounded-full bg-brand-500 px-1 text-xs leading-4 font-semibold text-white">
                  {count > 9 ? '9+' : count}
                </span>
                <span className="sr-only">{count} unread</span>
              </>
            )}
            <span className="sr-only">Notifications</span>
          </button>

          {bellOpen && (
            <div className="absolute right-0 z-30 mt-2 w-[min(20rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl border border-line bg-surface shadow-lg">
              <p className="border-b border-line px-4 py-2.5 text-sm font-semibold tracking-wide text-subtle uppercase">
                Notifications
              </p>
              <div className="max-h-96 overflow-y-auto">
                <NotificationsPanel notifications={notifications ?? []} />
              </div>
              <Link
                href="/dashboard/notifications"
                onClick={() => setBellOpen(false)}
                className="block border-t border-line px-4 py-2.5 text-center text-sm font-semibold text-brand-600 hover:bg-ink-25"
              >
                See all notifications
              </Link>
            </div>
          )}
        </div>

        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            className="flex items-center gap-2 rounded-full p-1 transition-colors hover:bg-ink-50 sm:pr-2.5"
          >
            {/* Initials, not a photograph. Staff records carry no avatar, and a generated
                one would be decoration on a bar that is already dense. */}
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-500 text-sm font-semibold text-white">
              {initials || <User className="size-4" aria-hidden="true" />}
            </span>
            <span className="hidden text-left leading-tight lg:block">
              {/* Name and role, never the email: a screen in an open-plan office is read by
                  whoever walks past, and the role is what a colleague actually needs. */}
              <span className="block max-w-28 truncate text-base font-medium text-body">
                {user?.name}
              </span>
              <span className="block max-w-28 truncate text-sm text-subtle">
                {user ? ROLE_LABELS[user.role] : ''}
              </span>
            </span>
          </button>

          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 z-30 mt-2 w-56 overflow-hidden rounded-xl border border-line bg-surface shadow-lg"
            >
              <div className="border-b border-line px-4 py-3">
                <p className="truncate text-base font-medium text-body">{user?.name}</p>
                <p className="truncate text-sm text-subtle">{user?.email}</p>
              </div>
              <button
                type="button"
                role="menuitem"
                onClick={handleSignOut}
                disabled={signingOut}
                className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-base text-body hover:bg-ink-50 disabled:text-ink-400"
              >
                <LogOut className="size-4" aria-hidden="true" />
                {signingOut ? 'Signing out…' : 'Sign out'}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export default TopBar;
