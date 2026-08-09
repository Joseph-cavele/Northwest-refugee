'use client';

import { useContext } from 'react';
import { AuthContext } from './AuthProvider';
import type { AuthContextValue } from './AuthProvider';

/**
 * The current session.
 *
 * Throws rather than returning null when used outside AuthProvider. A hook that
 * silently hands back "no user" would make an un-wrapped subtree look like a signed-out
 * one — the whole app would render its logged-out state and nobody would know why.
 */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }
  return context;
}
