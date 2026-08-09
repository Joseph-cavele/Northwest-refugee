import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Menu } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/auth/useAuth';
import { PATHS } from '@/routes/paths';
import { ROLE_LABELS } from '@/types/enums';

/*
 * The bar above the content: who is signed in, and the way out.
 *
 * Sign-out is a real control on every dashboard screen, not something buried in a menu.
 * These machines are shared — the front desk in Rustenburg is one computer and several
 * people — so ending a session has to be one obvious click, not three.
 */

export interface TopBarProps {
  /** Opens the nav drawer on small screens. Omitted where the sidebar is always visible. */
  onOpenNav?: () => void;
  title?: string;
}

export function TopBar({ onOpenNav, title }: TopBarProps) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    /*
     * signOut() is best-effort server-side and never rejects — it clears the local
     * session whatever the network did. So there is no failure path to render here, and
     * navigating unconditionally is correct: staying on a dashboard because logout could
     * not reach the server is the wrong way round on a shared machine.
     */
    await signOut();
    navigate(PATHS.signIn, { replace: true });
  }

  return (
    <header
      className={cn(
        'sticky top-0 z-20 flex h-topbar items-center gap-3 border-b border-line',
        'bg-surface/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-surface/80'
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

      {title && <h1 className="truncate text-sm font-semibold text-body">{title}</h1>}

      <div className="ml-auto flex items-center gap-3">
        {user && (
          /*
           * Name and role, not the email address. A screen in an open-plan office is read
           * by whoever walks past, and the role is what a colleague actually needs to see
           * to know whose session is open.
           */
          <div className="hidden text-right leading-tight sm:block">
            <p className="truncate text-sm font-medium text-body">{user.name}</p>
            <p className="truncate text-xs text-subtle">{ROLE_LABELS[user.role]}</p>
          </div>
        )}

        <button
          type="button"
          onClick={handleSignOut}
          disabled={signingOut}
          aria-busy={signingOut || undefined}
          className={cn(
            'inline-flex items-center gap-2 rounded-full border border-line px-4 py-2',
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
