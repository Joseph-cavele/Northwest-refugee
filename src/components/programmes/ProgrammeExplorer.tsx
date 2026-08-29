'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowUpRight, SlidersHorizontal, X } from 'lucide-react';
import {
  ACCESS_LABELS,
  AUDIENCE_LABELS,
  PILLAR_IMAGES,
  PROGRAMMES,
  PROGRAMME_PILLARS_IN_USE,
} from '@/lib/programmes';
import type { Programme, ProgrammeAccess, ProgrammeAudience } from '@/lib/programmes';
import { PILLAR_LABELS } from '@/types/enums';
import type { ProgrammePillar } from '@/types/enums';
import { PATHS } from '@/lib/paths';
import { cn } from '@/lib/utils';

/*
 * The programmes page: filters down one side, cards down the other.
 *
 * THREE THINGS THE REFERENCE LAYOUT HAS THAT THIS DELIBERATELY DOES NOT.
 *
 *   a price          The reference is a hotel listing and every card carries a rate. Nothing
 *                    here costs anything, and the space a price would occupy is given to the
 *                    one fact that actually varies between these programmes and decides what
 *                    somebody does next: how you start. Walk in, by referral, or book a place.
 *
 *   a star rating    Rating a service that people use because they have no alternative would
 *                    be grotesque, and inventing the ratings to fill the row worse.
 *
 *   pagination       Twelve programmes fit. A pager under twelve cards is a control that
 *                    exists to look like a catalogue, and pressing it would be the only way to
 *                    discover it does nothing.
 *
 * FILTERS ARE CLIENT-SIDE OVER A STATIC LIST, which is the right shape at this size: twelve
 * items filter instantly with no request, no loading state and no empty flash. It stops being
 * right somewhere north of a few hundred, at which point this becomes a server search and the
 * component keeps its shape.
 *
 * THE RESULT COUNT IS A LIVE REGION. Filtering with a checkbox changes a list somewhere below
 * the control being used, and without an announcement a screen-reader user gets no feedback
 * that anything happened at all. `aria-live="polite"` on the count is the smallest honest way
 * to say "nine programmes now".
 *
 * NO URL SYNCING, and it is worth knowing rather than assuming. A filtered view cannot be
 * shared or bookmarked, and the Back button leaves the page rather than undoing a filter. At
 * twelve items that is a fair trade for not putting query-string parsing into the critical
 * path of the page somebody reads when they need help; past that it stops being one.
 */

type Filters = {
  pillars: ProgrammePillar[];
  audiences: ProgrammeAudience[];
  access: ProgrammeAccess[];
};

const EMPTY: Filters = { pillars: [], audiences: [], access: [] };

const AUDIENCES = Object.keys(AUDIENCE_LABELS) as ProgrammeAudience[];
const ACCESS = Object.keys(ACCESS_LABELS) as ProgrammeAccess[];

export function ProgrammeExplorer() {
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [openOnMobile, setOpenOnMobile] = useState(false);

  const results = useMemo(
    () =>
      PROGRAMMES.filter(
        (programme) =>
          (filters.pillars.length === 0 || filters.pillars.includes(programme.pillar)) &&
          (filters.audiences.length === 0 || filters.audiences.includes(programme.audience)) &&
          (filters.access.length === 0 || filters.access.includes(programme.access))
      ),
    [filters]
  );

  const active =
    filters.pillars.length + filters.audiences.length + filters.access.length;

  function toggle<K extends keyof Filters>(group: K, value: Filters[K][number]) {
    setFilters((previous) => {
      const current = previous[group] as Filters[K][number][];
      const next = current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value];
      return { ...previous, [group]: next };
    });
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-12">
      {/* --- filters ------------------------------------------------------------------- */}
      {/*
       * A disclosure on a phone and a plain sidebar from lg. `hidden lg:block` on the panel
       * rather than unmounting it: the filter state has to survive the toggle, and a screen
       * reader should not meet a control whose panel does not exist.
       */}
      <div>
        <button
          type="button"
          onClick={() => setOpenOnMobile((was) => !was)}
          aria-expanded={openOnMobile}
          aria-controls="programme-filters"
          className="flex min-h-12 w-full items-center justify-between gap-3 rounded-full border border-line bg-surface px-6 text-sm font-semibold text-ink-950 lg:hidden"
        >
          <span className="flex items-center gap-2">
            <SlidersHorizontal className="size-4" aria-hidden="true" />
            Filter programmes
          </span>
          {active > 0 && (
            <span className="grid size-6 place-items-center rounded-full bg-brand-500 text-xs font-bold text-white">
              {active}
            </span>
          )}
        </button>

        <form
          id="programme-filters"
          className={cn(
            'mt-4 space-y-8 rounded-3xl border border-line bg-surface p-6 lg:sticky lg:top-24 lg:mt-0 lg:block',
            openOnMobile ? 'block' : 'hidden'
          )}
          // Nothing submits: every control filters as it changes, so a submit would be a
          // second way to do what has already happened.
          onSubmit={(event) => event.preventDefault()}
        >
          <FilterGroup
            legend="What kind of help"
            options={PROGRAMME_PILLARS_IN_USE.map((pillar) => ({
              value: pillar,
              label: PILLAR_LABELS[pillar],
              count: PROGRAMMES.filter((programme) => programme.pillar === pillar).length,
            }))}
            chosen={filters.pillars}
            onToggle={(value) => toggle('pillars', value as ProgrammePillar)}
          />

          <FilterGroup
            legend="Who it is for"
            options={AUDIENCES.map((audience) => ({
              value: audience,
              label: AUDIENCE_LABELS[audience],
              count: PROGRAMMES.filter((programme) => programme.audience === audience).length,
            }))}
            chosen={filters.audiences}
            onToggle={(value) => toggle('audiences', value as ProgrammeAudience)}
          />

          <FilterGroup
            legend="How to start"
            options={ACCESS.map((access) => ({
              value: access,
              label: ACCESS_LABELS[access],
              count: PROGRAMMES.filter((programme) => programme.access === access).length,
            }))}
            chosen={filters.access}
            onToggle={(value) => toggle('access', value as ProgrammeAccess)}
          />

          {active > 0 && (
            <button
              type="button"
              onClick={() => setFilters(EMPTY)}
              className="min-h-11 w-full rounded-full border border-line text-sm font-semibold text-body transition-colors hover:border-ink-950"
            >
              Clear all filters
            </button>
          )}
        </form>
      </div>

      {/* --- results -------------------------------------------------------------------- */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-5">
          <p aria-live="polite" className="text-sm text-muted">
            <span className="font-bold text-ink-950">{results.length}</span>{' '}
            {results.length === 1 ? 'programme' : 'programmes'}
            {active > 0 && ' matching your filters'}
          </p>

          {/*
           * The active filters, each removable on its own. A count alone tells somebody that
           * three filters are on; it does not tell them which, and a sidebar scrolled out of
           * view is a poor place to find out.
           */}
          {active > 0 && (
            <ul className="flex flex-wrap gap-2">
              {filters.pillars.map((pillar) => (
                <Chip key={pillar} label={PILLAR_LABELS[pillar]} onRemove={() => toggle('pillars', pillar)} />
              ))}
              {filters.audiences.map((audience) => (
                <Chip
                  key={audience}
                  label={AUDIENCE_LABELS[audience]}
                  onRemove={() => toggle('audiences', audience)}
                />
              ))}
              {filters.access.map((access) => (
                <Chip
                  key={access}
                  label={ACCESS_LABELS[access]}
                  onRemove={() => toggle('access', access)}
                />
              ))}
            </ul>
          )}
        </div>

        {results.length === 0 ? (
          <div className="mt-10 rounded-3xl border-2 border-dashed border-line-strong p-10 text-center">
            <p className="text-base font-bold text-ink-950">Nothing matches those filters</p>
            <p className="mt-2 text-sm leading-6 text-muted">
              That combination does not exist yet — it does not mean we cannot help. Come in and
              ask, or clear the filters to see everything.
            </p>
            <button
              type="button"
              onClick={() => setFilters(EMPTY)}
              className="mt-6 min-h-11 rounded-full bg-brand-500 px-6 text-xs font-semibold tracking-[0.09em] text-white uppercase transition-colors hover:bg-brand-700"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <ul className="mt-8 grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {results.map((programme) => (
              <li key={programme.id}>
                <ProgrammeCard programme={programme} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function FilterGroup<T extends string>({
  legend,
  options,
  chosen,
  onToggle,
}: {
  legend: string;
  options: { value: T; label: string; count: number }[];
  chosen: T[];
  onToggle: (value: T) => void;
}) {
  return (
    <fieldset>
      <legend className="text-sm font-bold text-ink-950">{legend}</legend>

      <div className="mt-3 space-y-1">
        {options.map(({ value, label, count }) => (
          <label
            key={value}
            className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 text-sm text-body transition-colors hover:bg-ink-50"
          >
            <input
              type="checkbox"
              checked={chosen.includes(value)}
              onChange={() => onToggle(value)}
              className="size-4 shrink-0 accent-brand-500"
            />
            <span className="flex-1">{label}</span>
            {/* The count, so an empty result is predictable before it happens. */}
            <span className="text-xs text-subtle tabular-nums">{count}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onRemove}
        className="inline-flex min-h-9 items-center gap-2 rounded-full bg-brand-50 px-4 text-xs font-semibold text-brand-700 transition-colors hover:bg-brand-100"
      >
        {label}
        <X className="size-3.5" aria-hidden="true" />
        <span className="sr-only">— remove this filter</span>
      </button>
    </li>
  );
}

function ProgrammeCard({ programme }: { programme: Programme }) {
  return (
    /*
     * THE SIGNATURE ON THIS PAGE IS THE ACCESS LINE, not the picture. Every card ends with how
     * you start — walk in, by referral, book a place — set in the same place at the same size,
     * so the grid can be read down that column alone. It is the fact that changes what a person
     * does next, and on a hotel listing it would be the price.
     */
    <article className="group flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-surface transition-all duration-200 hover:-translate-y-1.5 hover:shadow-lg hover:shadow-ink-950/5 motion-reduce:transform-none motion-reduce:transition-none">
      <div className="relative aspect-4/3 overflow-hidden bg-ink-100">
        <Image
          src={PILLAR_IMAGES[programme.pillar]}
          alt=""
          fill
          sizes="(min-width: 1280px) 22vw, (min-width: 640px) 40vw, 90vw"
          /*
           * Empty alt: the picture illustrates the pillar, not the programme, and the heading
           * beside it already names both. Describing it would announce a photograph of a stamp
           * before the words "Permit applications and renewals".
           */
          className="object-cover object-center transition-transform duration-500 group-hover:scale-[1.04] motion-reduce:transform-none"
        />

        <span className="absolute top-3 left-3 rounded-full bg-ink-950/85 px-3 py-1 text-xs font-semibold text-white backdrop-blur-sm">
          {PILLAR_LABELS[programme.pillar]}
        </span>
      </div>

      <div className="flex flex-1 flex-col p-6">
        <h3 className="text-base leading-6 font-extrabold tracking-[-0.02em] text-balance text-ink-950">
          {programme.title}
        </h3>
        <p className="mt-2.5 text-sm leading-6 text-muted">{programme.summary}</p>

        <p className="mt-4 text-sm leading-6 text-subtle italic">{programme.note}</p>

        <div className="mt-auto flex items-center justify-between gap-4 border-t border-line pt-5">
          <span>
            <span className="block text-xs font-semibold tracking-[0.05em] text-subtle uppercase">
              How to start
            </span>
            <span className="mt-0.5 block text-sm font-bold text-brand-600">
              {ACCESS_LABELS[programme.access]}
            </span>
          </span>

          <Link
            href={PATHS.getHelp}
            className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full bg-ink-950 px-5 text-xs font-semibold tracking-[0.05em] text-white uppercase transition-colors hover:bg-brand-500"
          >
            Ask
            <ArrowUpRight className="size-3.5" aria-hidden="true" />
            <span className="sr-only">about {programme.title}</span>
          </Link>
        </div>
      </div>
    </article>
  );
}

export default ProgrammeExplorer;
