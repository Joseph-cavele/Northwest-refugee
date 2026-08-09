'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, LogOut, Menu, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/auth/useAuth';
import { useApi } from '@/hooks/useApi';
import { PERMISSIONS } from '@/auth/permissions';
import { PATHS } from '@/lib/paths';
import { ROLE_LABELS } from '@/types/enums';
import { listNotifications, unreadCount } from '@/api/notifications.api';
import { NotificationsPanel } from '@/features/overview/components/NotificationsPanel';
import { TopBarSearch } from './TopBarSearch';

/*
 * The bar above the content: find someone, see what needs you, and get out.
 *
 * Three controls, each doing exactly one job. The reference layout this follows also
 * carries a dark-mode switch and a fullscreen toggle; neither is here. Dark mode is
 * deliberately undefined in globals.css — "a half-tested dark palette on a screen full of
 * status colours is worse than none" — and a control that toggles nothing is worse than an
 * absent one.
 *
 * SIGNING OUT STAYS ONE CLICK ON WIDE SCREENS. The front desk in Rustenburg is one computer
 * and several people; burying the way out of a session behind an avatar menu is the wrong
 * trade on a shared machine, so the menu is a convenience and the button is the guarantee.
 */

export interface TopBarProps {
  /** Opens the nav drawer on small screens. Omitted where the sidebar is always visible. */
  onOpenNav?: () => void;
  /** The page's own name, shown beside the controls on wide screens. */
  title?: string;
}

export function TopBar({ onOpenNav, title }: TopBarProps) {
  const { user, can, signOut } = useAuth();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLDivElement>(null);

  // Notifications are always the caller's own, so this needs no permission.
  const { data: unread } = useApi(
    useCallback((signal: AbortSignal) => unreadCount(signal), [])
  );

  const { data: notifications } = useApi(
    useCallback((signal: AbortSignal) => listNotifications({ limit: 6 }, signal), [])
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
     * whatever the network did. So there is no failure path to render, and navigating
     * unconditionally is correct: staying on a dashboard because logout could not reach the
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

  return (
    <header
      className={cn(
        'sticky top-0 z-20 flex h-topbar items-center gap-3 border-b border-line',
        'bg-surface/95 px-4 backdrop-blur supports-backdrop-filter:bg-surface/80'
      )}
    >
      {onOpenNav && (
        <button
          type="button"
          onClick={onOpenNav}
          className="rounded-lg p-2 text-muted hover:bg-ink-50 hover:text-body lg:hidden"
        >
          <Menu className="size-5" aria-hidden="true" />
          <span className="sr-only">Open navigation</span>
        </button>
      )}

      {title && (
        <h1 className="hidden shrink-0 truncate text-sm font-semibold text-body md:block">
          {title}
        </h1>
      )}

      {/* Only offered to roles that may read the register at all — the results come from
          it, and a search that always finds nothing is a broken control, not a safe one. */}
      {can(PERMISSIONS.BENEFICIARY_READ) && (
        <TopBarSearch className="mx-auto w-full max-w-md" />
      )}

      <div className={cn('flex items-center gap-1.5', !can(PERMISSIONS.BENEFICIARY_READ) && 'ml-auto')}>
        {/*
          * The bell OPENS something. A badge that counts unread items above a button that
          * does nothing tells a person there is work and then refuses to show it — and
          * there is no notifications page to send them to yet, so the list lives here.
          */}
        <div ref={bellRef} className="relative">
          <button
            type="button"
            onClick={() => setBellOpen((open) => !open)}
            aria-expanded={bellOpen}
            aria-haspopup="dialog"
            className="relative rounded-lg p-2 text-muted transition-colors hover:bg-ink-50 hover:text-body"
          >
            <Bell className="size-5" aria-hidden="true" />
            {count > 0 && (
              <>
                {/*
                  * The dot is the glance; the number is the fact. Both are needed — a count
                  * alone is easy to miss at this size, and a dot alone cannot say "nine".
                  * White on brand-500 is 7.3:1; the other logo colours would fail here.
                  */}
                <span className="absolute top-1 right-1 grid min-w-4 place-items-center rounded-full bg-brand-500 px-1 text-[0.625rem] leading-4 font-semibold text-white">
                  {count > 9 ? '9+' : count}
                </span>
                <span className="sr-only">{count} unread</span>
              </>
            )}
            <span className="sr-only">Notifications</span>
          </button>

          {bellOpen && (
            <div className="absolute right-0 z-30 mt-2 w-80 overflow-hidden rounded-xl border border-line bg-surface shadow-lg">
              <p className="border-b border-line px-4 py-2.5 text-xs font-semibold tracking-wide text-subtle uppercase">
                Notifications
              </p>
              <div className="max-h-96 overflow-y-auto">
                <NotificationsPanel notifications={notifications ?? []} />
              </div>
            </div>
          )}
        </div>

        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            className="flex items-center gap-2 rounded-full p-1 pr-2 transition-colors hover:bg-ink-50"
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-500 text-xs font-semibold text-white">
              {initials || <User className="size-4" aria-hidden="true" />}
            </span>
            <span className="hidden text-left leading-tight sm:block">
              {/* Name and role, never the email address: a screen in an open-plan office is
                  read by whoever walks past, and the role is what a colleague needs. */}
              <span className="block max-w-32 truncate text-sm font-medium text-body">
                {user?.name}
              </span>
              <span className="block max-w-32 truncate text-xs text-subtle">
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
                <p className="truncate text-sm font-medium text-body">{user?.name}</p>
                <p className="truncate text-xs text-subtle">{user?.email}</p>
              </div>
              <button
                type="button"
                role="menuitem"
                onClick={handleSignOut}
                disabled={signingOut}
                className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-body hover:bg-ink-50 disabled:text-ink-400"
              >
                <LogOut className="size-4" aria-hidden="true" />
                {signingOut ? 'Signing out…' : 'Sign out'}
              </button>
            </div>
          )}
        </div>

        {/* The guarantee behind the menu — see the note at the top of this file. */}
        <button
          type="button"
          onClick={handleSignOut}
          disabled={signingOut}
          aria-busy={signingOut || undefined}
          className={cn(
            'hidden items-center gap-2 rounded-full border border-line px-3.5 py-2 lg:inline-flex',
            'text-xs font-semibold tracking-wide text-muted transition-colors',
            'hover:border-line-strong hover:bg-ink-50 hover:text-body',
            'disabled:pointer-events-none disabled:text-ink-400'
          )}
        >
          <LogOut className="size-4" aria-hidden="true" />
          <span>{signingOut ? 'Signing out…' : 'Sign out'}</span>
        </button>
      </div>
    </header>
  );
}

export default TopBar;
