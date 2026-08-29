'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Banknote,
  CalendarDays,
  FileSpreadsheet,
  FileText,
  GraduationCap,
  HandCoins,
  LayoutDashboard,
  MessagesSquare,
  ScrollText,
  Send,
  ShieldCheck,
  UserPlus,
  Users,
  Wallet,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Logo, BrandRule } from '@/components/ui/logo';
import { cn } from '@/lib/utils';
import { useAuth } from '@/auth/useAuth';
import { PERMISSIONS } from '@/auth/permissions';
import type { Permission } from '@/auth/permissions';
import { PATHS } from '@/lib/paths';
import { ORG } from '@/lib/site';

/*
 * Primary navigation.
 *
 * THE RAIL IS THE LOGO'S OWN BLACK, not the reference template's indigo. The mark is a
 * black rounded square sheltering four figures — `--color-ink-950` is annotated in
 * globals.css as exactly that square — so the dark rail beside a white workspace is the
 * shape of the mark rather than a borrowed admin convention. It also does the job a dark
 * chrome does: it stops the navigation competing with the figures it sits next to.
 *
 * NO USER BLOCK. The reference puts an avatar, a name and a role at the top of the sidebar.
 * All three are already in the topbar's account menu, and the same identity twice on one
 * screen is the duplication that got the notifications panel removed. What is here instead
 * is the organisation, which the topbar does not carry.
 *
 * BUILT AND PLANNED ARE DIFFERENT THINGS, and the difference is visible. Built items are
 * links. Planned ones are not links at all — they do not navigate, they cannot 404, and
 * they carry the word "Soon". That is a change of position from "only list pages that
 * exist", taken because a one-item nav reads as a broken system rather than an early one;
 * a control that plainly announces it is not ready costs nothing to discover. Delete
 * PLANNED below and the sidebar goes back to built-only.
 */

interface NavItem {
  label: string;
  icon: LucideIcon;
  /** Omitted where every signed-in role may see it. */
  permission?: Permission;
}

interface BuiltItem extends NavItem {
  to: string;
  /** Matches nested paths too. Off for an index route, or it stays active everywhere. */
  end?: boolean;
}

interface Section {
  heading: string;
  built?: BuiltItem[];
  planned?: NavItem[];
}

/*
 * Grouped the way the organisation is, not the way the database is: a caseworker thinks in
 * "the people" and "their work", not in collections. Permission decides what to RENDER and
 * nothing more — the server re-checks every request behind every one of these.
 */
const SECTIONS: Section[] = [
  {
    heading: 'Today',
    built: [{ to: PATHS.dashboard, label: 'Overview', icon: LayoutDashboard, end: true }],
  },
  {
    heading: 'People',
    built: [
      {
        to: '/dashboard/beneficiaries',
        label: 'Beneficiaries',
        icon: Users,
        permission: PERMISSIONS.BENEFICIARY_READ,
      },
      {
        to: '/dashboard/cases',
        label: 'Cases',
        icon: FileText,
        permission: PERMISSIONS.CASE_READ,
      },
      {
        to: '/dashboard/service-requests',
        label: 'Service requests',
        icon: Send,
        permission: PERMISSIONS.SERVICE_REQUEST_READ,
      },
      {
        to: '/dashboard/documents',
        label: 'Documents',
        icon: ScrollText,
        // The LIST only. Opening a file needs document:download and happens on the
        // person's record — see the note at the top of DocumentLibrary.
        permission: PERMISSIONS.DOCUMENT_READ,
      },
    ],
  },
  {
    heading: 'Programmes',
    built: [
      {
        to: '/dashboard/programmes',
        label: 'Programmes',
        icon: GraduationCap,
        permission: PERMISSIONS.PROGRAMME_READ,
      },
      {
        to: '/dashboard/events',
        label: 'Events',
        icon: CalendarDays,
        permission: PERMISSIONS.EVENT_READ,
      },
    ],
  },
  {
    heading: 'Money',
    built: [
      {
        to: '/dashboard/finance',
        label: 'Finance',
        icon: Banknote,
        // transaction:read, not budget:read — the ledger and the approvals queue are the
        // page, and a finance officer holds the first without the second.
        permission: PERMISSIONS.TRANSACTION_READ,
        end: true,
      },
      {
        to: '/dashboard/finance/budgets',
        label: 'Budgets',
        icon: Wallet,
        permission: PERMISSIONS.BUDGET_READ,
      },
      {
        to: '/dashboard/finance/overview',
        label: 'Financial overview',
        icon: FileSpreadsheet,
        // transaction:read: the budget and fundraising halves are gated inside the screen,
        // so nobody is shown a total containing something they may not see.
        permission: PERMISSIONS.TRANSACTION_READ,
      },
      {
        to: '/dashboard/fundraising',
        label: 'Fundraising',
        icon: HandCoins,
        // campaign:read, not donation:read — a comms officer runs campaigns without ever
        // seeing who gave what, and the donor-facing panels inside are gated separately.
        permission: PERMISSIONS.CAMPAIGN_READ,
      },
    ],
  },
  {
    heading: 'Organisation',
    built: [
      {
        to: '/dashboard/access-requests',
        label: 'Access requests',
        icon: UserPlus,
        // read, not review — an M&E Officer may see who is waiting without being able to
        // let anyone in. The decide buttons are gated separately inside the screen.
        permission: PERMISSIONS.ACCESS_REQUEST_READ,
      },
      {
        to: '/dashboard/staff-board',
        label: 'Staff board',
        icon: MessagesSquare,
        // The outer door only. Which channels appear is decided by membership, server side.
        permission: PERMISSIONS.CHATBOARD_READ,
      },
      {
        to: '/dashboard/audit',
        label: 'Audit trail',
        icon: ShieldCheck,
        permission: PERMISSIONS.AUDIT_READ,
      },
    ],
  },
];

export interface SidebarProps {
  /** Closes the drawer after a tap on small screens, where the nav overlays the page. */
  onNavigate?: () => void;
  /** Icon-only rail. The labels go, the targets and the order do not. */
  collapsed?: boolean;
  className?: string;
}

export function Sidebar({ onNavigate, collapsed = false, className }: SidebarProps) {
  const { can } = useAuth();
  const pathname = usePathname() ?? '';
  const allowed = (item: NavItem) => !item.permission || can(item.permission);

  const sections = SECTIONS.map((section) => ({
    ...section,
    built: (section.built ?? []).filter(allowed),
    planned: (section.planned ?? []).filter(allowed),
  })).filter((section) => section.built.length + section.planned.length > 0);

  return (
    <nav
      aria-label="Main"
      className={cn(
        'flex h-full flex-col bg-ink-950 text-white transition-[width] duration-200 motion-reduce:transition-none',
        collapsed ? 'w-16' : 'w-sidebar',
        className
      )}
    >
      <div
        className={cn(
          'flex flex-col gap-3 border-b border-white/10 py-5',
          collapsed ? 'items-center px-2' : 'px-5'
        )}
      >
        <div className="flex items-center gap-3">
          {/* The mark stays at every width. A rail with no identity is a column of glyphs. */}
          <Logo size={34} decorative />
          {!collapsed && (
            <div className="min-w-0">
              <p className="truncate text-base font-semibold text-white">{ORG.shortName}</p>
              <p className="truncate text-sm text-white/55">{ORG.city}</p>
            </div>
          )}
        </div>
        {!collapsed && <BrandRule />}
      </div>

      <div className="flex-1 overflow-y-auto py-3">
        {sections.map((section) => (
          <div key={section.heading} className="mb-1 px-3">
            {/* Headings are structure, not decoration: they name how the work divides up.
                In the rail they would be four letters of nothing, so they go. */}
            {!collapsed && (
              <p className="px-3 pt-3 pb-1.5 text-xs font-semibold tracking-[0.12em] text-white/40 uppercase">
                {section.heading}
              </p>
            )}

            <ul className="flex flex-col gap-0.5">
              {section.built.map((item) => {
                const isActive = item.end
                  ? pathname === item.to
                  : pathname === item.to || pathname.startsWith(`${item.to}/`);

                return (
                  <li key={item.label}>
                    <Link
                      href={item.to}
                      onClick={onNavigate}
                      // aria-current is what tells a screen reader which page this is. The
                      // fill is only a visual echo — colour is never the sole signal here.
                      aria-current={isActive ? 'page' : undefined}
                      title={collapsed ? item.label : undefined}
                      aria-label={collapsed ? item.label : undefined}
                      className={cn(
                        'flex items-center rounded-lg text-base transition-colors',
                        collapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2',
                        isActive
                          // White on brand-500 is 7.3:1. Of the logo's four colours it is
                          // the only one that carries white text at all.
                          ? 'bg-brand-500 font-semibold text-white'
                          : 'text-white/70 hover:bg-white/10 hover:text-white'
                      )}
                    >
                      <item.icon className="size-4 shrink-0" aria-hidden="true" />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                      {isActive && <span className="sr-only">(current page)</span>}
                    </Link>
                  </li>
                );
              })}

              {section.planned.map((item) => (
                <li key={item.label}>
                  {/*
                    * Not a link, and not a button. There is nothing to navigate to and
                    * nothing to press, so it is text — which is also why it never 404s and
                    * never appears in the tab order to be pressed by mistake.
                    */}
                  <p
                    title={collapsed ? `${item.label} — not built yet` : undefined}
                    /*
                     * white/50 over black is roughly 5.3:1 — dim enough to sit behind the
                     * built items, still AA at this size. The 35% that reads "obviously
                     * inactive" is about 3.5:1, and these are informational text rather
                     * than disabled controls, so they do not get that exemption.
                     */
                    className={cn(
                      'flex items-center rounded-lg text-base text-white/50',
                      collapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2'
                    )}
                  >
                    <item.icon className="size-4 shrink-0" aria-hidden="true" />
                    {!collapsed && (
                      <>
                        <span className="truncate">{item.label}</span>
                        {/* The state in a word. Dimmed text alone reads as a bug. */}
                        <span className="ml-auto shrink-0 rounded-full bg-white/10 px-1.5 py-0.5 text-xs font-semibold tracking-wide text-white/65 uppercase">
                          Soon
                        </span>
                      </>
                    )}
                    <span className="sr-only">Not built yet</span>
                  </p>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {!collapsed && (
        <p className="border-t border-white/10 px-5 py-4 text-sm leading-relaxed text-white/45">
          {ORG.tagline}
        </p>
      )}
    </nav>
  );
}

export default Sidebar;
