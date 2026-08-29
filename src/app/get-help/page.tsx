import type { Metadata } from 'next';
import { Clock, DoorOpen, Languages, ShieldCheck } from 'lucide-react';
import { PageBanner } from '@/components/site/PageBanner';
import { SiteNav } from '@/components/site/SiteNav';
import { SiteFooter } from '@/components/site/SiteFooter';
import { ChatGuide } from '@/components/site/ChatGuide';
import { HelpSteps } from '@/components/site/HelpSteps';
import { ORG } from '@/lib/site';

export const metadata: Metadata = {
  title: `Get help — ${ORG.shortName}`,
  description: `Help with permits and documents, school places, food, shelter and training for refugees, asylum seekers and migrants in ${ORG.city}. Walk in — no appointment, and no documents needed to be seen.`,
};

/*
 * `/get-help` — the route the whole site exists for, and the third to resolve.
 *
 * SiteNav has carried "Get help" as its primary call to action since the header was built, in
 * gold, ahead of Donate. It has been pointing at a 404 the entire time.
 *
 * THE FORM IS THE SECOND THING ON THIS PAGE, NOT THE FIRST. The four assurances above it are
 * what a person who is frightened of officialdom needs before they will type anything: no
 * appointment, no documents required, four languages, and nothing recorded without their
 * permission. Every one of them is true of the office and enforced in the system. A stepped
 * form at the top of this page would ask somebody to start giving details before they had been
 * told any of that.
 *
 * IT IS THE REGISTER'S OWN INTAKE, and HelpSteps.tsx mirrors createBeneficiarySchema field for
 * field — name, date of birth, gender, nationality, languages, immigration status, cellphone,
 * household, and a guardian the moment the date of birth says the person is under 18.
 *
 * TWO FIELDS THE REGISTER ACCEPTS ARE DELIBERATELY ABSENT: the permit number, which is
 * encrypted at rest and belongs to a caseworker reading the document itself, and the
 * vulnerability flags, which the dashboard will not even display without a permission and an
 * audit entry. That file argues both at length.
 *
 * THE ASSISTANT IS ALSO HERE, in the corner, and it is the better route for somebody who does
 * not know what to ask for: it answers the same seven doors this form lists, in the same words,
 * from /api/v1/guide — which is public precisely so nobody needs an account to find out how to
 * get help.
 */

const BANNER = {
  src: '/cards-images/mission-scene.png' as string | null,
  alt: 'A waiting area with people seated along one wall while a caseworker crosses the room carrying a folder.',
  brief: '16:9 or wider — the waiting area, seen from the door',
};

const ASSURANCES = [
  {
    id: 'walk-in',
    Icon: DoorOpen,
    title: 'No appointment',
    body: 'Walk in during office hours and somebody will see you.',
  },
  {
    id: 'documents',
    Icon: ShieldCheck,
    title: 'No documents needed',
    body: 'Come even if you have nothing. That is a common reason people come to us.',
  },
  {
    id: 'languages',
    Icon: Languages,
    title: 'Four languages',
    body: 'English, Français, Kiswahili and Português — say which you prefer.',
  },
  {
    id: 'consent',
    Icon: Clock,
    title: 'Nothing written down without you',
    body: 'A caseworker asks your permission before recording anything at all.',
  },
];

export default function GetHelpPage() {
  return (
    <>
      <SiteNav />

      <main>
        <PageBanner
          eyebrow="Get help"
          title="Start here"
          lead="Tell us what you need and somebody will come back to you — or simply walk in. You do not need papers, an appointment, or perfect English."
          image={BANNER}
        />

        {/* --- what is true before you type anything ---------------------------------- */}
        <section aria-labelledby="assurances-heading" className="bg-white font-(family-name:--font-ui)">
          <div className="mx-auto max-w-[80rem] px-4 py-14 lg:px-8 lg:py-20">
            <h2 id="assurances-heading" className="sr-only">
              What to expect
            </h2>

            <ul className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
              {ASSURANCES.map(({ id, Icon, title, body }) => (
                <li key={id}>
                  <span
                    aria-hidden="true"
                    className="grid size-12 place-items-center rounded-full bg-brand-50 text-brand-600"
                  >
                    <Icon className="size-6" strokeWidth={1.75} />
                  </span>
                  <h3 className="mt-4 text-base leading-6 font-bold text-ink-950">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted">{body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* --- the request ------------------------------------------------------------- */}
        <section aria-labelledby="request-heading" className="bg-canvas font-(family-name:--font-ui)">
          <div className="mx-auto max-w-[80rem] px-4 py-16 lg:px-8 lg:py-28">
            <div className="max-w-2xl">
              <p className="flex items-center gap-3 text-sm leading-5 font-semibold tracking-[0.05em] text-brand-500 uppercase">
                <span aria-hidden="true" className="h-0.5 w-8 shrink-0 bg-gold-400" />
                Tell us what you need
              </p>
              <h2
                id="request-heading"
                className="mt-5 text-[clamp(1.75rem,4vw,2.5rem)] leading-[1.14] font-extrabold tracking-[-0.02em] text-balance text-ink-950"
              >
                Six short steps
              </h2>
              <p className="mt-6 text-base leading-7 text-muted">
                This is the same information a caseworker takes at the desk, so doing it now
                saves the queue. We never ask for your permit number here — bring the permit
                itself. Nothing you type is stored on this website: the last step opens your own
                email so you can read it all before it goes.
              </p>
            </div>

            <div className="mt-12">
              <HelpSteps />
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
      <ChatGuide />
    </>
  );
}
