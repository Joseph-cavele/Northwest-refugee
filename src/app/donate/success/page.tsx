import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteNav } from '@/components/site/SiteNav';
import { SiteFooter } from '@/components/site/SiteFooter';
import { DonationReceiptPanel } from '@/components/donations/DonationReceiptPanel';
import { ORG } from '@/lib/site';

export const metadata: Metadata = {
  title: `Thank you — ${ORG.shortName}`,
  /*
   * Not indexed. This page is only ever reached with somebody's donation reference in the URL,
   * and a search engine holding those would be handing out receipt keys.
   */
  robots: { index: false, follow: false },
};

/*
 * `/donate/success` — where a gateway sends the donor back to.
 *
 * ARRIVING HERE PROVES NOTHING, and the page is built around that. A redirect can be typed,
 * bookmarked, shared or forged; all it carries is a reference. So this page READS the donation
 * and reports whatever status the server holds — which only a verified webhook can have set.
 *
 * THAT MEANS "PENDING" IS A NORMAL OUTCOME HERE, not an error. Gateways redirect the browser
 * the instant a payment is authorised and deliver their webhook seconds later, so a donor can
 * easily beat the notification to this page. Telling them "we have not seen the money yet,
 * refresh in a moment" is the truth; showing a thank-you the server cannot vouch for is the
 * one thing this page must never do.
 */

export default function DonationSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ reference?: string }>;
}) {
  return (
    <>
      <SiteNav />

      <main className="bg-canvas font-(family-name:--font-ui)">
        <div className="mx-auto max-w-3xl px-4 py-16 lg:px-8 lg:py-28">
          <DonationReceiptPanel searchParams={searchParams} />

          <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
            <Link
              href="/"
              className="inline-flex min-h-12 items-center justify-center rounded-full border border-line bg-surface px-8 text-xs font-semibold tracking-[0.09em] text-ink-950 uppercase transition-colors hover:border-ink-950"
            >
              Return home
            </Link>
            <Link
              href="/donate"
              className="inline-flex min-h-12 items-center justify-center rounded-full bg-brand-500 px-8 text-xs font-semibold tracking-[0.09em] text-white uppercase transition-colors hover:bg-brand-700"
            >
              Make another donation
            </Link>
          </div>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}
