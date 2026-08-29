# Image prompts — event posters

The poster staff upload from the dashboard (**Events → open one → Edit → Upload a picture**).
One file serves two frames, which is the only real constraint here:

| Where | Aspect | Rendered at |
|---|---|---|
| The card on `/news` | **4:3** | up to ~420px wide |
| The header on `/news/[id]` | **16:9** | up to 1024px wide |

**So supply 3:2 at 1800 × 1200, with the subject centred and a little headroom.** Both crops
are taken from the middle, so anything important near the top or bottom edge is lost on one of
them. A face or a hand at the very top of the frame will be cut off on the detail page.

JPEG, PNG or WebP, under 10 MB. Uploads go to Cloudinary as **publicly addressable** files —
that is deliberate for a poster and wrong for anything else, so never upload something a person
gave the office in confidence.

Generated images, following the practice recorded in `Mission.tsx` and `Appeals.tsx`:
**illustrative, and nobody in them is a client.** Never caption one with a name or a story.

---

## The house style

The same block that governs the About page images, so the site holds together. Prepend it to
every prompt, then add the scene:

> Photorealistic documentary photograph, South Africa. Shot on 35mm film, natural available
> daylight only — hard sun through windows throwing long shadow shapes across the floor, deep
> shadows, slightly blown highlights near the glass. Muted, desaturated colour; soft contrast in
> the mid-tones. Observational distance, unposed, nobody looking at the camera, no smiling at
> the lens, no charity-poster emotion. Ordinary South African public-building interior: painted
> plaster walls, vinyl or terrazzo floor, steel-framed windows, face-brick, tubular-steel chairs,
> a noticeboard with curling papers. Everyday clothing — headwraps, work overalls, jackets,
> school uniform. Candid, quiet, matter-of-fact.

And on every one:

> Composition: 3:2 landscape, subject centred with headroom, nothing important within 15% of
> the top or bottom edge — the image is cropped to both 4:3 and 16:9.
>
> Negative: no logos, no readable signage or text, no flags, no stock-photo gloss, no HDR, no
> shallow-depth-of-field portrait bokeh, no direct eye contact, no recognisable public figures,
> no watermarks.

---

## One per event type

The eight categories in `EVENT_TYPES`. These are the reusable briefs — an event of a given kind
can use its type's poster until someone shoots the real thing.

### `TRAINING` — skills workshops, courses
> A skills workshop in a plain hall: eight or nine adults at trestle tables with notebooks and
> pens, a facilitator standing at a flip chart mid-sentence with her back half-turned. Mixed
> ages, mostly women. Late-morning light from high windows down one side. Nobody is performing
> for the room; two people at the back are comparing notes with each other.

### `OUTREACH` — documentation clinics, mobile advice days
> A folding table set up under a gazebo outside a community hall, two staff members with ring
> binders and a laptop, a short queue of people waiting in the sun with document folders held
> against their chests. A township street and parked minibus taxis in the soft background.
> Mid-morning, hard shadows, dust.

### `COMMUNITY_DIALOGUE` — public meetings, conversations
> Thirty people seated in a loose circle of plastic chairs in a community hall, one person
> standing to speak with a hand raised slightly, the rest listening. Shafts of daylight through
> high louvred windows crossing the floor. Wide, taken from the back of the room at chair
> height so the circle reads as a circle.

### `AWARENESS` — drives, campaigns, information days
> Trestle tables stacked with folded blankets and bagged winter clothing inside a hall, two
> volunteers sorting into piles, a family choosing from a table in the background. Cold flat
> daylight through open double doors. Practical and busy, not ceremonial.

### `COMMEMORATION` — World Refugee Day and similar
> A commemoration in a community hall at the end of the afternoon: people standing rather than
> seated, a few holding printed programmes, one older woman with her eyes closed listening.
> Low warm side light through a doorway. Dignified and quiet — a room paying attention, not a
> celebration.

### `FUNDRAISER`
> A small fundraising evening in a modest hall: round tables with paper cloths, people talking
> in twos and threes, a handwritten pledge board on an easel at the side. Warm interior light
> after dark, windows black. Modest and local — no ballroom, no stage lighting.

### `STAKEHOLDER_MEETING` — partners, local government
> Six people around a boardroom table in a small office: printed agendas, water glasses, a
> laptop open, one person mid-explanation with a pen in hand. Daylight through a venetian
> blind striping the table. Working meeting, not a photo call.

### `OTHER` — the fallback
> The exterior of a small first-floor advice office on a Rustenburg street in the late
> afternoon, doorway open, two or three people walking towards it along the pavement. Low sun
> raking across the facade, long shadows. Neutral enough to sit above any kind of notice.

---

## What happens with no poster

Nothing breaks. The card and the detail page both hold a labelled empty frame at the right
proportions, so the layout is complete and an event without artwork simply reads as an event
without artwork. That is why the demo seed ships **no** posters: borrowing a programme
illustration would put a picture on a public page that is not of that event, and a demo whose
artwork misrepresents its own records teaches the reviewer to distrust the artwork everywhere.
