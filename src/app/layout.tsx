import type { Metadata, Viewport } from 'next';
import { AuthProvider } from '@/auth/AuthProvider';
import { ORG } from '@/lib/site';
import '@/styles/globals.css';

/*
 * The root layout — what main.tsx and App.tsx were between them.
 *
 * BrowserRouter is gone: routing is the file tree under app/. What survives unchanged is
 * the shape, and it matters. AuthProvider wraps everything because the route guards read
 * the session and the boot refresh must run once for the application rather than once per
 * navigation.
 *
 * This file is a SERVER component and AuthProvider is a client one. That boundary is the
 * point: the provider holds the access token in memory, and memory that only exists in the
 * browser is memory a server render cannot serialise into the HTML by accident.
 */

export const metadata: Metadata = {
  title: {
    default: `${ORG.shortName} — ${ORG.name}`,
    template: `%s · ${ORG.shortName}`,
  },
  description: ORG.tagline,
  /*
   * The dashboard is behind a login and the register is not something to be indexed. The
   * public site sets its own metadata per page and may opt back in; the safe default for
   * an application holding this data is out.
   */
  robots: { index: false, follow: false },
  icons: { icon: '/Assets/logo.png' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // The logo's black. Matches the auth panels so a phone's chrome does not flash white.
  themeColor: '#000000',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // lang matters for a screen reader's pronunciation, and this is South African English.
    <html lang="en-ZA">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
