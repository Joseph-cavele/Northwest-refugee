import type { Metadata } from 'next';
import Link from 'next/link';
import { Phone } from 'lucide-react';
import { PageBanner } from '@/components/site/PageBanner';
import { SiteNav } from '@/components/site/SiteNav';
import { SiteFooter } from '@/components/site/SiteFooter';
import { ChatGuide } from '@/components/site/ChatGuide';
import { ProgrammeExplorer } from '@/components/programmes/ProgrammeExplorer';
import { PROGRAMMES } from '@/lib/programmes';
import { PATHS } from '@/lib/paths';
import { ORG } from '@/lib/site';

export const metadata: Metadata = {
  title: `Programmes — ${ORG.shortName}`,
  description: `The ${PROGRAMMES.length} programmes NWHR runs in ${ORG.city}: documentation and permits, school placement, skills training, community work, and support for women and young people.`,
};

/*
 * `/programmes` — the fourth marketing route to resolve, and the one the navigation has been
 * pointing at since the header was built.
 *
 * THE LIST IS STATIC AND lib/programmes.ts SAYS WHY. In short: `/api/v1/programmes` is
 * permission-gated because the register's programmes carry budgets, coordinators and enrolment
 * counts, none of which belongs on a public page — and the front-of-house description changes
 * when the work changes, not when a coordinator is reassigned.
 *
 * THE PAGE IS A FILTERED CATALOGUE, NOT A BROCHURE, and the filters are the argument for that
 * shape: somebody arrives knowing they need papers, or that it is for a child, or that they can
 * only come in without an appointment. Three questions, and every programme answers all three.
 *
 * WHAT SITS ABOVE THE GRID IS DELIBERATE. A reader who cannot find their situation in a filter
 * needs to be told, before they scroll, that the list is not the limit of what the office does.
 * That is what the line under the heading is for, and it is why the empty state says the same
 * thing rather than "no results".
 */

export default function ProgrammesPage() {
  return (
    <>
      <SiteNav />

      <main>
        <PageBanner
          eyebrow="Programmes"
          title="What we run"
          lead={`${PROGRAMMES.length} programmes across documentation, education, skills, community work and support for women and young people. Most need nothing but for you to come in.`}
          image={{
            src: '/cards-images/programme-social-cohesion.png',
            alt: 'Two pairs of hands passing a cardboard box of maize meal and tinned food across a table.',
            brief: '16:9 or wider — a programme session in progress',
          }}
        />

        <section aria-labelledby="programmes-heading" className="bg-canvas font-(family-name:--font-ui)">
          <div className="mx-auto max-w-[80rem] px-4 py-14 lg:px-8 lg:py-20">
            <div className="max-w-2xl">
              <h2
                id="programmes-heading"
                className="text-[clamp(1.5rem,3vw,2rem)] leading-tight font-extrabold tracking-[-0.02em] text-balance text-ink-950"
              >
                Find the one you need
              </h2>
              <p className="mt-4 text-base leading-7 text-muted">
                If nothing here matches your situation, that does not mean we cannot help —{' '}
                <Link
                  href={PATHS.getHelp}
                  className="font-semibold text-brand-600 underline underline-offset-2"
                >
                  tell us what you need
                </Link>{' '}
                or ring{' '}
                <a
                  href={ORG.phoneHref}
                  className="font-semibold text-brand-600 underline underline-offset-2"
                >
                  {ORG.phone}
                </a>
                . Most people arrive with a problem that does not have a programme name.
              </p>
            </div>

            <div className="mt-12">
              <ProgrammeExplorer />
            </div>

            {/*
             * The phone, once, at the foot of a long grid. Somebody who has read twelve cards
             * and not recognised themselves in any of them is exactly who should see it.
             */}
            <p className="mt-14 flex items-start gap-3 border-t border-line pt-8 text-sm leading-6 text-muted">
              <Phone className="mt-0.5 size-5 shrink-0 text-brand-500" aria-hidden="true" />
              <span>
                Not sure which one? Ring{' '}
                <a href={ORG.phoneHref} className="font-semibold text-brand-600 underline">
                  {ORG.phone}
                </a>{' '}
                and describe the situation — we will tell you whether to come in, and what to
                bring.
              </span>
            </p>
          </div>
        </section>
      </main>

      <SiteFooter />
      <ChatGuide />
    </>
  );
}
