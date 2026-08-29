import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Banknote, HandCoins, Phone, ShieldCheck } from 'lucide-react';
import { PageBanner } from '@/components/site/PageBanner';
import { SiteNav } from '@/components/site/SiteNav';
import { SiteFooter } from '@/components/site/SiteFooter';
import { ChatGuide } from '@/components/site/ChatGuide';
import { DonationForm } from '@/components/donations/DonationForm';
import { ImpactCards } from '@/components/donations/ImpactCards';
import { buttonClasses } from '@/components/ui/button-classes';
import { ORG } from '@/lib/site';

export const metadata: Metadata = {
  title: `Donate — ${ORG.shortName}`,
  description: `Give towards documentation, education, skills, emergency support and empowerment programmes for refugees and asylum seekers in ${ORG.city}.`,
};

/*
 * `/donate` — the donation page and the flow behind it.
 *
 * NO CARD DETAIL EVER REACHES THIS APPLICATION. The form collects an amount and a name, the
 * server creates a PENDING donation and asks Paystack or PayPal for a URL, and the donor
 * enters their card on the gateway's own domain. Nothing in this deployment is inside PCI
 * scope, and there is no publishable key in the bundle because none is needed.
 *
 * AND NOTHING HERE MARKS A GIFT AS PAID. The redirect back from a gateway proves only that a
 * browser was pointed at a URL. A donation becomes SETTLED when a webhook says so, after a
 * server-to-server verification and an amount comparison — see payment.service.js for the
 * Paystack path and checkout.service.js for PayPal's. The success page reads that status; it
 * never writes it.
 *
 * WHY THIS IS NOT THE STRUCTURE THE BRIEF ASKED FOR. The brief proposed `models/Donation.ts`,
 * `lib/mongodb.ts`, `lib/paystack.ts` and `app/api/donations/route.ts`. All four already exist
 * here under different names — `fundraising.model.js` (with Donor, Campaign and Pledge beside
 * Donation), `config/db.js`, `payments/paystack.provider.js`, and the versioned API tree — and
 * a second Donation model would have been a second ledger: two places money is counted, two
 * schemas to keep in step, and a dashboard that agrees with neither. The pieces that were
 * genuinely missing are the ones that got built: a public checkout route, a PayPal provider
 * and its webhook, a receipt read, and this page.
 *
 * IT IS ALSO WHY AMOUNTS ARE `amountCents`. The brief's `amount` would have been the one field
 * in the system holding money as a float.
 */

const BANNER = {
  src: '/cards-images/mission-scene.png' as string | null,
  alt: 'A waiting area with people seated along one wall while a caseworker crosses the room carrying a folder.',
  brief: '16:9 or wider — the waiting area on a weekday morning',
};

/*
 * What a donor can check, rather than what they can be told. Both are controls in
 * finance.service.js and either can be demonstrated on request — which is the difference
 * between an assurance and a slogan.
 */
const ASSURANCES = [
  {
    id: 'approval',
    Icon: ShieldCheck,
    title: 'Nobody approves their own spending',
    body: 'The person who creates a payment can never be the one who approves it, and amounts above an approver’s ceiling escalate to the Executive Director.',
  },
  {
    id: 'immutable',
    Icon: Banknote,
    title: 'Posted transactions cannot be edited',
    body: 'A correction is a reversal that writes its own matching entry. Nothing in the ledger can be quietly changed after the fact.',
  },
];

export default function DonatePage() {
  return (
    <>
      <SiteNav />

      <main>
        <PageBanner
          eyebrow="Donate"
          title="Your support can change a life"
          lead="Help NWHR provide refugees and asylum seekers with access to essential services, education, documentation support, skills development and opportunities for a better future."
          image={BANNER}
        />

        {/* --- the two ways in ---------------------------------------------------------- */}
        {/*
         * The banner carries the argument, so this strip carries only the two actions. They are
         * anchors rather than buttons: both go somewhere, and a middle-click or an open-in-new-
         * tab on a <button> does nothing.
         */}
        <section className="bg-canvas font-(family-name:--font-ui)">
          <div className="mx-auto flex max-w-[80rem] flex-col items-center gap-4 px-4 py-10 sm:flex-row sm:justify-center lg:px-8">
            <Link href="#give" className={buttonClasses('primary', { className: 'min-h-13' })}>
              Donate now
              <ArrowRight className="size-4 shrink-0" aria-hidden="true" />
            </Link>

            <Link href="#impact" className={buttonClasses('subtle', { className: 'min-h-13' })}>
              Learn about our impact
            </Link>
          </div>
        </section>

        {/* --- impact -------------------------------------------------------------------- */}
        <section
          id="impact"
          aria-labelledby="impact-heading"
          className="scroll-mt-24 bg-white font-(family-name:--font-ui)"
        >
          <div className="mx-auto max-w-[80rem] px-4 py-16 lg:px-8 lg:py-28">
            <div className="max-w-2xl">
              <p className="flex items-center gap-3 text-sm leading-5 font-semibold tracking-[0.05em] text-brand-500 uppercase">
                <span aria-hidden="true" className="h-0.5 w-8 shrink-0 bg-gold-400" />
                What your gift supports
              </p>
              <h2
                id="impact-heading"
                className="mt-5 text-[clamp(1.75rem,4vw,2.5rem)] leading-[1.14] font-extrabold tracking-[-0.02em] text-balance text-ink-950"
              >
                Six kinds of work, one office
              </h2>
              <p className="mt-6 text-base leading-7 text-muted">
                An undirected gift is the most useful of all — it covers what no funder will
                pay for, like a taxi fare to Home Affairs. You can also choose where yours goes.
              </p>
            </div>

            <div className="mt-14">
              <ImpactCards />
            </div>
          </div>
        </section>

        {/* --- the form ------------------------------------------------------------------ */}
        <section
          id="give"
          aria-labelledby="give-heading"
          className="scroll-mt-24 bg-canvas font-(family-name:--font-ui)"
        >
          <div className="mx-auto max-w-[80rem] px-4 py-16 lg:px-8 lg:py-28">
            <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.7fr)] lg:gap-16">
              <div className="rounded-3xl bg-surface p-6 shadow-sm sm:p-10">
                <h2
                  id="give-heading"
                  className="text-[clamp(1.5rem,3vw,2rem)] leading-tight font-extrabold tracking-[-0.02em] text-ink-950"
                >
                  Make a donation
                </h2>
                <p className="mt-3 text-base leading-7 text-muted">
                  Small regular gifts are worth more to this office than occasional large ones.
                </p>

                <div className="mt-8">
                  <DonationForm />
                </div>
              </div>

              {/* --- assurances and the offline route --------------------------------- */}
              <div className="space-y-6">
                {ASSURANCES.map(({ id, Icon, title, body }) => (
                  <div key={id} className="rounded-2xl border border-line bg-surface p-7">
                    <span
                      aria-hidden="true"
                      className="grid size-11 place-items-center rounded-full bg-brand-50 text-brand-600"
                    >
                      <Icon className="size-5" strokeWidth={1.75} />
                    </span>
                    <h3 className="mt-4 text-base leading-6 font-bold text-ink-950">{title}</h3>
                    <p className="mt-2 text-sm leading-6 text-muted">{body}</p>
                  </div>
                ))}

                {/*
                 * The route that needs no gateway at all. It stays on the page even once cards
                 * work: an EFT costs the organisation nothing in fees, and a donor who would
                 * rather not use a card should not have to hunt for the alternative.
                 */}
                <div className="rounded-2xl border border-line bg-surface p-7">
                  <span
                    aria-hidden="true"
                    className="grid size-11 place-items-center rounded-full bg-gold-100 text-gold-700"
                  >
                    <HandCoins className="size-5" strokeWidth={1.75} />
                  </span>
                  <h3 className="mt-4 text-base leading-6 font-bold text-ink-950">
                    EFT, or something other than money
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-muted">
                    Food, uniforms, stationery and time are all useful, and the office can tell
                    you what is short this month.
                  </p>
                  <p className="mt-4 flex items-start gap-3 text-sm leading-6 text-body">
                    <Phone className="mt-0.5 size-5 shrink-0 text-brand-500" aria-hidden="true" />
                    <a href={ORG.phoneHref} className="font-semibold text-brand-600 underline">
                      {ORG.phone}
                    </a>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
      <ChatGuide />
    </>
  );
}
