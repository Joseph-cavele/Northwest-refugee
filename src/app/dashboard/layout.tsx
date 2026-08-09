import RequireAuth from '@/auth/RequireAuth';
import { DashboardLayout } from '@/layouts/DashboardLayout';

/*
 * Everything behind a login.
 *
 * This is the `<Route element={<RequireAuth />}>` layout route from the React Router
 * table, expressed as a directory. Every page under app/dashboard/ waits for the session
 * to resolve and is redirected to sign-in if there is none — and each still guards its own
 * data with RequirePermission, because this decides what to render and nothing more.
 */
export default function DashboardRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <DashboardLayout>{children}</DashboardLayout>
    </RequireAuth>
  );
}
