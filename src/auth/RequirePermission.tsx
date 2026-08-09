'use client';

import type { ReactNode } from 'react';
import { Alert } from '@/components/ui/alert';
import { useAuth } from './useAuth';
import type { Permission } from './permissions';

/*
 * Gate for a route that needs a specific permission.
 *
 * Renders an explanation rather than redirecting. Someone who followed a colleague's
 * link to the approval queue needs to be told their role does not include it —
 * bouncing them silently to a dashboard looks like the link was broken, and they ask
 * for it to be fixed.
 *
 * Like RequireAuth, this decides what to render and nothing more. The server enforces
 * the same permission on every request the page would make.
 */

export interface RequirePermissionProps {
  permission: Permission;
  /** Optional override for the denial message — name the feature where you can. */
  fallback?: ReactNode;
  /** The guarded page. Wrap it in a layout, or the page itself. */
  children: ReactNode;
}

export function RequirePermission({ permission, fallback, children }: RequirePermissionProps) {
  const { can } = useAuth();

  if (!can(permission)) {
    return (
      fallback ?? (
        <main className="grid min-h-[50vh] place-items-center p-6">
          <div className="w-full max-w-md">
            <Alert tone="error">
              You do not have access to this page. If you need it, ask an administrator to
              review your role.
            </Alert>
          </div>
        </main>
      )
    );
  }

  return <>{children}</>;
}

export default RequirePermission;
