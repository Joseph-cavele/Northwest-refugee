import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import {
  ArrowRight,
  Baby,
  Banknote,
  Briefcase,
  Bus,
  FileCheck2,
  GraduationCap,
  HeartHandshake,
  Home,
  ImageIcon,
  MessageCircleQuestion,
  Phone,
  ShieldCheck,
  ShoppingBasket,
  Stethoscope,
  Users,
  Wrench,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { PageBanner } from '@/components/site/PageBanner';
import { SiteNav } from '@/components/site/SiteNav';
import { SiteFooter } from '@/components/site/SiteFooter';
import { ChatGuide } from '@/components/site/ChatGuide';
import { SERVICES } from '@/lib/services';
import { PATHS } from '@/lib/paths';
import { ORG } from '@/lib/site';

export const metadata: Metadata = {
  title: `Our services — ${ORG.shortName}`,
  description: `What you can ask ${ORG.name} for: papers and permits, school placement, food, shelter, healthcare, GBV support, training and more, in ${ORG.city}.`,
};

/*
 * `/services` — what a person can ask for, as opposed to `/programmes`, which is what NWHR runs.
 *
 * THE DISTINCTION IS NOT A WORD GAME AND IT IS WORTH HOLDING. A service is a discrete thing
 * somebody needs on a given day and is what a request gets filed as; a programme is ongoing
 * work they join. Most people arrive needing the first. lib/services.ts sets out the rest of
 * the reasoning, including what happens if the two pages ever start saying the same thing.
 *
 * EVERY CARD IS A REGISTER CATEGORY. The fourteen below are SERVICE_CATEGORIES from
 * types/enums.ts — the same values a caseworker picks from — so anything advertised here can be
 * counted in the system, and anything the system cannot log cannot appear here.
 *
 * ICONS, NOT FOURTEEN PHOTOGRAPHS. The reference uses an icon per card and that is the right
 * call at this count: fourteen photographs is fourteen shoots, and a page that waits for them
 * ships never. The image space on this page is reserved where a photograph earns its place —
 * the banner, and one wide frame beside the sentence about what happens when you arrive.
 *
 * THE ICON MAP LIVES HERE RATHER THAN IN THE DATA. lib/services.ts names an icon as a STRING,
 * because a component is a function and this page is where functions are allowed to be. Keeping
 * the data serialisable means it can cross to a client component later without the "Functions
 * cannot be passed directly to Client Components" error that CardCarousel documents.
 */

const ICONS: Record<string, LucideIcon> = {
  FileCheck2,
  GraduationCap,
  ShoppingBasket,
  Home,
  Stethoscope,
  HeartHandshake,
  ShieldCheck,
  Baby,
  Users,
  Wrench,
  Briefcase,
  Banknote,
  Bus,
  MessageCircleQuestion,
};

/*
 * The one photograph this page asks for beyond the banner.
 *
 * ILLUSTRATIVE, AND NOBODY IN IT IS A CLIENT — a generated image, the same call Appeals.tsx and
 * GetInvolved.tsx record, and the only reason a face can sit on a page beside the words
 * "refugee" and "asylum seeker" at all. Never caption it with a name or a story.
 *
 * IT KEEPS ITS RESERVATION. Set `src` to null and the labelled empty frame returns with the
 * layout unchanged.
 */
const ARRIVING = {
  src: '/cards-images/services-arriving.png' as string | null,
  alt: 'A caseworker leaning across a desk to shake hands with a woman who has just sat down, a notebook and a mug between them.',
  brief: '16:9 — the front desk, somebody being greeted rather than processed',
};

export default function ServicesPage() {
  return (
    <>
      <SiteNav />

      <main>
        <PageBanner
          eyebrow="Our services"
          title="What you can ask us for"
          lead="Fourteen kinds of help, and one of them is “something else”. You do not need documents, an appointment, or perfect English to ask for any of them."
          image={{
            src: null,
            alt: '',
            brief: '16:9 or wider — the office entrance on a weekday morning',
          }}
          breadcrumb={[{ label: 'Home', href: PATHS.home }]}
        />

        {/* --- the grid ------------------------------------------------------------------ */}
        <section aria-labelledby="services-heading" className="bg-white font-(family-name:--font-ui)">
          <div className="mx-auto max-w-[80rem] px-4 py-16 lg:px-8 lg:py-28">
            <div className="mx-auto max-w-2xl text-center">
              <p className="flex items-center justify-center gap-3 text-sm leading-5 font-semibold tracking-[0.05em] text-brand-500 uppercase">
                <span aria-hidden="true" className="h-0.5 w-8 shrink-0 bg-gold-400" />
                Services
              </p>
              <h2
                id="services-heading"
                className="mt-5 text-[clamp(1.75rem,4vw,2.75rem)] leading-[1.12] font-extrabold tracking-[-0.02em] text-balance text-ink-950"
              >
                A wide range of support, from one office
              </h2>
              <p className="mt-6 text-base leading-7 text-pretty text-muted">
                Each of these is something a caseworker can open a file on the day you ask. If
                your situation spans several, say so — most do.
              </p>
            </div>

            <ul className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {SERVICES.map((service) => {
                const Icon = ICONS[service.icon] ?? MessageCircleQuestion;

                return (
                  <li key={service.id}>
                    {/*
                     * THE WHOLE CARD IS THE LINK, not a separate arrow. The reference draws an
                     * arrow in the corner and makes only that clickable, which on a phone is a
                     * 24px target inside a 300px card. Here the anchor wraps everything and the
                     * arrow is decoration that moves on hover — one target, one tab stop.
                     */}
                    <Link
                      href={PATHS.getHelp}
                      className="group flex h-full flex-col rounded-2xl border border-line bg-surface p-8 transition-all duration-200 hover:-translate-y-1.5 hover:border-brand-200 hover:shadow-lg hover:shadow-ink-950/5 focus-visible:-translate-y-1.5 motion-reduce:transform-none motion-reduce:transition-none"
                    >
                      <span
                        aria-hidden="true"
                        className="grid size-14 place-items-center rounded-2xl bg-brand-50 text-brand-600 transition-colors duration-200 group-hover:bg-brand-500 group-hover:text-white"
                      >
                        <Icon className="size-7" strokeWidth={1.5} />
                      </span>

                      <h3 className="mt-6 text-base leading-6 font-extrabold tracking-[-0.02em] text-balance text-ink-950">
                        {service.title}
                      </h3>
                      <p className="mt-2.5 text-sm leading-6 text-muted">{service.summary}</p>

                      <span
                        aria-hidden="true"
                        className="mt-6 inline-flex size-10 items-center justify-center rounded-full border border-line text-ink-950 transition-all duration-200 group-hover:translate-x-1 group-hover:border-brand-500 group-hover:bg-brand-500 group-hover:text-white"
                      >
                        <ArrowRight className="size-4" />
                      </span>

                      {/* The link's accessible name. "Ask about food" beats fourteen links all
                          announced as "Get help". */}
                      <span className="sr-only">Ask about {service.title}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        {/* --- what happens when you arrive ---------------------------------------------- */}
        <section aria-labelledby="arriving-heading" className="bg-canvas font-(family-name:--font-ui)">
          <div className="mx-auto max-w-[80rem] px-4 py-16 lg:px-8 lg:py-28">
            <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
              <div className="relative aspect-video overflow-hidden rounded-3xl bg-ink-100">
                {ARRIVING.src ? (
                  <Image
                    src={ARRIVING.src}
                    alt={ARRIVING.alt}
                    fill
                    sizes="(min-width: 1024px) 45vw, 100vw"
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
                        {ARRIVING.brief}
                      </span>
                    </span>
                  </div>
                )}
              </div>

              <div>
                <h2
                  id="arriving-heading"
                  className="text-[clamp(1.5rem,3vw,2rem)] leading-tight font-extrabold tracking-[-0.02em] text-balance text-ink-950"
                >
                  You do not have to know which one you need
                </h2>
                <p className="mt-5 text-base leading-7 text-muted">
                  Most people arrive with a problem, not a category. A caseworker sits with you,
                  works out what is actually in the way, and opens a file for it — often more
                  than one. Nothing is written down before you agree to it.
                </p>

                <div className="mt-8 flex flex-wrap gap-3">
                  <Link
                    href={PATHS.getHelp}
                    className="inline-flex min-h-13 items-center gap-2 rounded-full bg-brand-500 px-8 text-xs font-semibold tracking-[0.09em] text-white uppercase transition-colors hover:bg-brand-700"
                  >
                    Tell us what you need
                    <ArrowRight className="size-4 shrink-0" aria-hidden="true" />
                  </Link>

                  <a
                    href={ORG.phoneHref}
                    className="inline-flex min-h-13 items-center gap-2 rounded-full border border-line bg-surface px-8 text-xs font-semibold tracking-[0.09em] text-ink-950 uppercase transition-colors hover:border-ink-950"
                  >
                    <Phone className="size-4 shrink-0" aria-hidden="true" />
                    {ORG.phone}
                  </a>
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
