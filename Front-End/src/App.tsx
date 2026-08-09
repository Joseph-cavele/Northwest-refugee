import { AuthProvider } from '@/auth/AuthProvider';
import { AppRoutes } from '@/routes';

/*
 * The application shell.
 *
 * AuthProvider wraps the router because route guards read the session, and because the
 * boot refresh should start once for the app rather than per navigation. Further
 * providers — toasts, an error boundary — nest here as they arrive, so main.tsx stays a
 * mount point and the route table stays in routes/.
 */
export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
