'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Logo, BrandRule } from '@/components/ui/logo';
import { cn } from '@/lib/utils';
import { useAuth } from '@/auth/useAuth';
import type { Permission } from '@/auth/permissions';
import { PATHS } from '@/lib/paths';
import { ORG } from '@/lib/site';

/*
 * Primary navigation.
 *
 * ONLY LINKS TO PAGES THAT EXIST. A nav listing every planned module would put ten dead
 * links in front of a caseworker, and the first one they click lands on a 404 — which
 * reads as a broken system rather than an unfinished one. Add an entry in the same
 * commit as the page it points at, not before.
 *
 * `permission` decides what to RENDER and nothing more. Hiding a link the user's role
 * cannot use keeps the nav honest, but the server re-checks every request behind it, so
 * an item shown by mistake buys an explanation screen, never data.
 */

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Omitted where every signed-in role may see the page. */
  permission?: Permission;
  /** Matches nested paths too. Off for an index route, or it stays active everywhere. */
  end?: boolean;
}

const NAV: NavItem[] = [
  { to: PATHS.dashboard, label: 'Overview', icon: LayoutDashboard, end: true },
];

export interface SidebarProps {
  /** Closes the drawer after a tap on small screens, where the nav overlays the page. */
  onNavigate?: () => void;
  className?: string;
}

export function Sidebar({ onNavigate, className }: SidebarProps) {
  const { can } = useAuth();
  const pathname = usePathname() ?? '';
  const visible = NAV.filter((item) => !item.permission || can(item.permission));

  return (
    <nav
      aria-label="Main"
      className={cn('flex h-full w-sidebar flex-col border-r border-line bg-surface', className)}
    >
      <div className="flex flex-col gap-3 border-b border-line px-5 py-5">
        <div className="flex items-center gap-3">
          <Logo size={36} decorative />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-body">{ORG.shortName}</p>
            <p className="truncate text-xs text-subtle">{ORG.city}</p>
          </div>
        </div>
        <BrandRule />
      </div>

      <ul className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
        {visible.map((item) => {
          /*
           * NavLink computed this for us and set aria-current itself; next/link does
           * neither, so the active test is explicit. `end` means "this exact path only" —
           * without it an index route matches every page beneath it and the whole nav
           * lights up at once.
           */
          const isActive = item.end
            ? pathname === item.to
            : pathname === item.to || pathname.startsWith(`${item.to}/`);

          return (
            <li key={item.to}>
              <Link
                href={item.to}
                onClick={onNavigate}
                // aria-current is what actually tells a screen reader which page this is.
                // The blue is only a visual echo of it, and colour is never the sole
                // signal for anything in this interface.
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                  isActive
                    ? 'bg-brand-50 font-semibold text-brand-700'
                    : 'text-muted hover:bg-ink-50 hover:text-body'
                )}
              >
                <item.icon className="size-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{item.label}</span>
                {isActive && <span className="sr-only">(current page)</span>}
              </Link>
            </li>
          );
        })}
      </ul>

      <p className="border-t border-line px-5 py-4 text-xs leading-relaxed text-subtle">
        {ORG.tagline}
      </p>
    </nav>
  );
}

export default Sidebar;
