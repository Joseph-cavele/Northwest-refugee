'use client';

/*
 * The shape of the screen, while the figures are in flight.
 *
 * THIS REPLACED A CENTRED SPINNER, and the reason is layout rather than fashion. A spinner
 * occupies one line in the middle of an empty page; when the cards land, six rows of content
 * appear underneath the reader and everything they were looking at moves. These blocks sit in
 * the boxes the real cards will sit in, so nothing jumps.
 *
 * IT IS DELIBERATELY MUTE. No labels, no zeros, no placeholder figures — a grey block cannot
 * be misread as a measurement, whereas a "0" briefly rendered where a count belongs is a
 * claim about the register that nobody made.
 *
 * `aria-hidden`, with the live region left to the caller: a screen reader should hear "loading
 * your figures" once, not a description of eleven grey rectangles.
 */

/** One muted block. `.skeleton` carries the sweep, and drops it under reduced motion. */
function Block({ className }: { className?: string }) {
  return <div className={`skeleton rounded-lg ${className ?? ''}`} />;
}

function Card({ className, children }: { className?: string; children?: React.ReactNode }) {
  return (
    <div className={`rounded-2xl border border-line bg-surface p-5 ${className ?? ''}`}>
      {children}
    </div>
  );
}

export function OverviewSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-hidden="true">
      {/* --- the hero row --- */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/*
         * The hero's placeholder is the only one that keeps its brand colour. It is the one
         * element whose position and mass the reader already knows from every previous visit,
         * so painting it grey would be a bigger change on screen than leaving it blue.
         */}
        <div className="relative flex min-h-56 flex-col justify-between overflow-hidden rounded-2xl bg-brand-500/90 p-6 shadow-hero lg:col-span-2">
          <div className="brand-rule absolute inset-x-0 top-0 h-1" />
          <div className="flex flex-col gap-3">
            <div className="h-6 w-32 rounded-full bg-white/20" />
            <div className="h-5 w-48 rounded bg-white/15" />
          </div>
          <div className="flex flex-col gap-3">
            <div className="h-12 w-40 rounded bg-white/20" />
            <div className="h-4 w-56 rounded bg-white/15" />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
          {[0, 1].map((i) => (
            <Card key={i}>
              <Block className="h-3 w-24" />
              <Block className="mt-3 h-8 w-20" />
              <Block className="mt-4 h-3 w-32" />
            </Card>
          ))}
        </div>
      </div>

      {/* --- the four supporting figures --- */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i} className="flex items-center gap-4">
            <Block className="size-11 shrink-0 rounded-xl" />
            <div className="min-w-0 flex-1">
              <Block className="h-5 w-16" />
              <Block className="mt-2 h-3 w-28" />
            </div>
          </Card>
        ))}
      </div>

      {/* --- one wide panel, standing in for the chart row --- */}
      <Card className="p-0">
        <div className="border-b border-line px-5 py-4">
          <Block className="h-4 w-40" />
          <Block className="mt-2 h-3 w-56" />
        </div>
        <div className="p-5">
          <Block className="h-48 w-full rounded-xl" />
        </div>
      </Card>
    </div>
  );
}

export default OverviewSkeleton;
