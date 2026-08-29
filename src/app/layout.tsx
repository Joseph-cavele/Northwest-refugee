import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { AuthProvider } from '@/auth/AuthProvider';
import { ORG } from '@/lib/site';
import '@/styles/globals.css';

/*
 * Inter, because design/DESIGN.md specifies it and nothing else: "utilizes Inter
 * exclusively to maintain a cohesive, systematic SaaS appearance", with the hierarchy
 * carried by weight and scale rather than by mixing families.
 *
 * ONE FAMILY, FOUR WEIGHTS, and a variable rather than a body rule. DESIGN.md describes the
 * PUBLIC site; the dashboard's type was a separate decision — the system stack, chosen so a
 * staff screen opened over a shared phone hotspot costs no font request. Exposing Inter as
 * `--font-ui` and letting the public components opt in keeps both true at once.
 *
 * next/font, NOT a Google CDN <link>: it downloads and subsets at build time and serves from
 * this origin, so there is no third-party connection, nothing render-blocking, and no CSP
 * exception to carve out when one is finally written.
 *
 * Nunito and Caveat are gone. They belonged to the earlier Charifund direction, which
 * DESIGN.md replaces — its display type is Inter at 800 with tight tracking, not a script.
 */
const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '600', '700', '800'],
  variable: '--font-ui',
  display: 'swap',
});

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
  // The 128 rather than the master: a favicon is drawn at 16–32px, and pointing it at the
  // 1.4 MB original made every page load it a second time purely for the browser tab.
  icons: { icon: '/images/logo-128.png' },
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
    <html lang="en-ZA" className={inter.variable}>
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
