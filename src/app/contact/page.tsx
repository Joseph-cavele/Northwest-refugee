import type { Metadata } from 'next';
import Image from 'next/image';
import { Clock, ImageIcon, MapPin, Phone } from 'lucide-react';
import { MapPanel } from '@/components/site/MapPanel';
import { PageBanner } from '@/components/site/PageBanner';
import { SiteNav } from '@/components/site/SiteNav';
import { SiteFooter } from '@/components/site/SiteFooter';
import { ChatGuide } from '@/components/site/ChatGuide';
import { Contact } from '@/components/site/Contact';
import { ORG } from '@/lib/site';

export const metadata: Metadata = {
  title: `Contact ${ORG.shortName} — ${ORG.city}`,
  description: `Call, email or visit ${ORG.name} in ${ORG.city}. Walk in during office hours — no appointment, and no documents needed to be seen.`,
};

/*
 * `/contact` — the first marketing route on this site that resolves.
 *
 * Until now every path in lib/paths.ts 404'd, including the two this page answers: the
 * "Contact now" button in the get-involved band and "Become a volunteer" under the volunteer
 * row both point here. Those were live links to a missing page.
 *
 * IT REUSES THE HOME PAGE'S CONTACT CARD rather than restating it. One card, one form, one set
 * of details — a second copy is how a phone number gets changed in one place and not the
 * other, and this is the number somebody dials from a queue.
 *
 * WHAT THIS PAGE ADDS THAT THE HOME PAGE CANNOT. A visitor who has navigated to /contact has
 * already decided to make contact; what they need next is the practical detail a section
 * embedded between fundraising bands has no room for — when the office is open, what happens
 * when they walk in, and what to bring. That is the block below the card.
 *
 * THE ADDRESS AND THE HOURS ARE BOTH CONFIRMED NOW, and this page is where they land: 12
 * Pretorius Street, and 08:00 to 17:00. Everything below states them plainly rather than
 * making a visitor deduce them.
 *
 * THE MAP LOADS WITH THE PAGE, at NWHR's instruction and against the alternative recorded in
 * MapPanel.tsx. The address and the landmark are still readable without it, so the frame is
 * the convenience rather than the only route to finding the office.
 *
 * ONE RESERVATION LEFT, AND IT SHOULD NOT BE FILLED BY A GENERATOR. The frontage photograph
 * exists so that somebody who has crossed Rustenburg on a taxi fare recognises the door when
 * they reach it — a rendered building would show a door that does not exist, which is worse
 * than an empty frame because it looks authoritative. Photograph the real one.
 *
 * TODO(NWHR): take the frontage photograph. A phone from across the street is enough.
 * TODO(NWHR): confirm Saturday and public holidays — the hours below name weekdays only.
 */

/*
 * The banner photograph. Full bleed behind the page title, greyscaled and washed to near-black
 * — so what it needs is a scene that survives at 12% of its own contrast, not a detail.
 */
const BANNER = {
  src: '/cards-images/contact-banner.png' as string | null,
  alt: 'People waiting on chairs along a sunlit corridor, seen from the far end.',
  brief: '16:9 or wider — the office door on a weekday morning, people arriving',
};

/** The photograph that tells somebody they have found the right door. */
const FRONTAGE = {
  src: null as string | null,
  alt: '',
  brief: '16:9 — the building from the street, so the door is recognisable on arrival',
};

const PRACTICAL = [
  {
    id: 'walk-in',
    Icon: Clock,
    title: 'Walk in, no appointment',
    body: 'Come during office hours and somebody will see you. You do not need documents to be seen — arriving with nothing is one of the commonest reasons people come to us.',
  },
  {
    id: 'bring',
    Icon: MapPin,
    title: 'Bring whatever you already have',
    body: 'Permits, asylum papers, birth certificates, old appointment slips — even expired ones. A caseworker will go through what you have and what each next step asks for.',
  },
  {
    id: 'call',
    Icon: Phone,
    title: 'Or call first',
    body: `If travelling is difficult or the matter is urgent, ring ${ORG.phone}. We can tell you over the phone whether you need to come in at all.`,
  },
];

export default function ContactPage() {
  return (
    <>
      <SiteNav />

      <main>
        {/*
         * The banner carries the page's only h1. Everything below it opens at h2, including the
         * contact card, which keeps the document outline correct on a page assembled from a
         * section built for somewhere else.
         */}
        <PageBanner
          eyebrow="Contact"
          title="Come in, or call us"
          lead={`${ORG.name} is in ${ORG.city}. Walk in during office hours, telephone, or write — whichever is easiest. Nothing you tell us is stored without your consent.`}
          image={BANNER}
        />

        {/* --- the card, exactly as the home page carries it -------------------------- */}
        <Contact />

        {/* --- what happens when you arrive ------------------------------------------- */}
        <section aria-labelledby="visiting-heading" className="bg-white font-(family-name:--font-ui)">
          <div className="mx-auto max-w-[80rem] px-4 py-16 lg:px-8 lg:py-28">
            <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:gap-20">
              <div>
                <h2
                  id="visiting-heading"
                  className="text-[clamp(1.75rem,4vw,2.5rem)] leading-[1.14] font-extrabold tracking-[-0.02em] text-balance text-ink-950"
                >
                  Visiting the office
                </h2>

                {/*
                 * THE HOURS ARE NWHR'S OWN, given on 20 August 2026: 08:00 to 17:00. The DAYS
                 * are an assumption — Monday to Friday is what "office hours" ordinarily means
                 * and what the rest of this page implies, but nobody has said so. Confirm it,
                 * and confirm what happens on a Saturday and a public holiday, because the
                 * person this page is written for cannot afford a wasted trip to find out.
                 *
                 * A <time> element on each end, so the hours are machine-readable — this is the
                 * fact a search result or an assistant is most likely to lift off the page.
                 */}
                <p className="mt-6 flex items-center gap-3 text-base leading-7 text-body">
                  <Clock className="size-5 shrink-0 text-brand-500" aria-hidden="true" />
                  <span>
                    Monday to Friday, <time dateTime="08:00">08:00</time> to{' '}
                    <time dateTime="17:00">17:00</time>
                  </span>
                </p>

                <ul className="mt-8 space-y-7">
                  {PRACTICAL.map(({ id, Icon, title, body }) => (
                    <li key={id} className="flex gap-4">
                      <span
                        aria-hidden="true"
                        className="grid size-11 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-600"
                      >
                        <Icon className="size-5" strokeWidth={1.75} />
                      </span>
                      <div>
                        <h3 className="text-base leading-6 font-bold text-ink-950">{title}</h3>
                        <p className="mt-1.5 text-sm leading-6 text-muted">{body}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              {/* --- the frontage, and where the map will go --------------------------- */}
              <div>
                <div className="relative aspect-video overflow-hidden rounded-3xl bg-ink-50">
                  {FRONTAGE.src ? (
                    <Image
                      src={FRONTAGE.src}
                      alt={FRONTAGE.alt}
                      fill
                      sizes="(min-width: 1024px) 42vw, 100vw"
                      className="object-cover object-center"
                    />
                  ) : (
                    <div className="grid h-full place-items-center border-2 border-dashed border-line-strong p-6 text-center">
                      <span>
                        <ImageIcon
                          className="mx-auto size-8 text-line-strong"
                          strokeWidth={1.5}
                          aria-hidden="true"
                        />
                        <span className="mt-3 block text-sm font-semibold text-subtle">
                          {FRONTAGE.brief}
                        </span>
                      </span>
                    </div>
                  )}
                </div>

                {/*
                 * NO MAP, AND NOT AS AN OVERSIGHT. A map needs a confirmed address; an
                 * approximate pin on a walk-in service is worse than none, because a pin looks
                 * authoritative in a way a missing map does not. The frame is not even drawn
                 * for it — that would imply the address exists and is merely late.
                 */}
                {/* MapPanel's header records what loading a third-party frame on this page
                    costs, and that NWHR decided to show it anyway. */}
                <MapPanel />

                <p className="mt-4 text-sm leading-6 text-muted">
                  If you cannot find it, ring{' '}
                  <a
                    href={ORG.phoneHref}
                    className="font-semibold text-brand-600 underline underline-offset-2"
                  >
                    {ORG.phone}
                  </a>{' '}
                  and we will direct you from where you are.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />

      {/* The assistant floats over the page rather than belonging to a section, and on this
          page it answers the question a visitor most often arrives with. */}
      <ChatGuide />
    </>
  );
}
