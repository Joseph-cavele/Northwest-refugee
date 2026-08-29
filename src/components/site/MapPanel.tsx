import { ExternalLink } from 'lucide-react';
import { ORG } from '@/lib/site';

/*
 * The map on the contact page.
 *
 * IT LOADS WITH THE PAGE, at NWHR's instruction. The first build put it behind a "Show the
 * map" button, because an embedded frame hands Google the visitor's IP address, their user
 * agent and the fact that they were reading a refugee organisation's contact page — a request
 * made from their own connection, whatever this site's privacy notice says. That is a real
 * consideration for this audience and it was raised; the decision was to show the map.
 *
 * WHAT SURVIVED THAT DECISION, because it costs nothing:
 *
 *   the notice   one line, under the frame, saying where the map comes from. A visitor who
 *                would rather not have loaded it can at least know that they did.
 *   lazy         `loading="lazy"` means the request is not made until the frame is near the
 *                viewport, so somebody who never scrolls this far never contacts Google.
 *   no cookies   `output=embed` is the frameless embed and needs no API key and no Maps JS
 *                bundle — a considerably lighter footprint than the scripted widget.
 *
 * TODO(NWHR): this belongs in the privacy notice — a page that embeds a third party has to say
 * so there, not only here. See PATHS.privacy, which is the one route in that file that is
 * arguably required rather than merely planned.
 *
 * THE PIN IS GEOCODED FROM THE ADDRESS, NOT FROM COORDINATES TYPED HERE. `?q=<address>` hands
 * Google the street address and lets it place the marker. Hand-written latitude and longitude
 * would be a number invented in this file, and lib/site.ts is explicit that the location of a
 * walk-in service is the one fact that must never be guessed — an approximate pin is worse
 * than no pin, because a pin looks authoritative.
 *
 * NO CLIENT JAVASCRIPT. With the button gone there is no state left to hold, so this renders
 * on the server and ships nothing to the browser but the markup.
 */

const QUERY = `${ORG.address}, South Africa`;

const EMBED_SRC = `https://www.google.com/maps?q=${encodeURIComponent(QUERY)}&output=embed`;
const DIRECTIONS_HREF = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
  QUERY
)}`;

export function MapPanel() {
  return (
    <div className="mt-6 overflow-hidden rounded-3xl border border-line">
      <iframe
        // Named, because an unlabelled frame is announced as "frame" and nothing else.
        title={`Map showing ${ORG.address}`}
        src={EMBED_SRC}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        className="block aspect-video w-full border-0"
      />

      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-line bg-surface px-6 py-4">
        <a
          href={DIRECTIONS_HREF}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-brand-600 hover:text-brand-700"
        >
          Get directions
          <ExternalLink className="size-4 shrink-0" aria-hidden="true" />
          <span className="sr-only">(opens Google Maps in a new tab)</span>
        </a>

        <p className="text-sm leading-6 text-muted">Map loaded from Google.</p>
      </div>
    </div>
  );
}

export default MapPanel;
