# Image prompts — `/about`

Four reserved frames in [`src/app/about/page.tsx`](../src/app/about/page.tsx). Each one is a
dashed placeholder at the picture's real proportions, so dropping the files in moves nothing.

Generated images, following the practice already recorded in `Mission.tsx`, `Appeals.tsx` and
`GetInvolved.tsx`: **illustrative, and nobody in them is a client.** That is the only reason a
face may appear on a page carrying the words *refugee* and *asylum seeker* at all. Never caption
one with a name, a story or a date.

Save as PNG into `public/cards-images/`, named as below.

---

## The house style

These four have to sit beside `mission-scene.png` and `contact-banner.png`, which are the
reference for the look. Prepend this to every prompt, then add the scene:

> Photorealistic documentary photograph, South Africa. Shot on 35mm film, natural available
> daylight only — hard sun through windows throwing long shadow shapes across the floor, deep
> shadows, slightly blown highlights near the glass. Muted, desaturated colour; soft contrast in
> the mid-tones. Observational distance, unposed, nobody looking at the camera, no smiling at
> the lens, no charity-poster emotion. Ordinary South African public-building interior: painted
> plaster walls, vinyl or terrazzo floor, steel-framed windows, face-brick, tubular-steel chairs,
> a noticeboard with curling papers. Everyday clothing — headwraps, work overalls, jackets,
> school uniform. Candid, quiet, matter-of-fact.

And this on every one:

> Negative: no logos, no readable signage or text, no flags, no stock-photo gloss, no HDR, no
> shallow-depth-of-field portrait bokeh, no direct eye contact, no recognisable public figures,
> no watermarks.

---

## 1. `about-banner.png` — the page banner

**2400 × 1000 (12:5), or any wide crop ≥ 1920px.**

Rendered `fill` + `object-cover`, **converted to greyscale in code**, and covered by a dark
gradient wash that runs 88% opaque on the left to 70% at the right edge. So: it must read as a
*tonal texture*, never as a picture you look at. Colour is thrown away, the left third is
crushed to near-black, and white type sits over the middle.

> The exterior of a small first-floor advice office on a Rustenburg street in the late
> afternoon: a plain painted building above a shopfront, an external staircase, a doorway
> standing open, two or three people walking towards it along the pavement, seen from across the
> street. Wide establishing shot, low sun raking across the facade from the right, long shadows.
> Strong simple shapes and clear tonal separation — the picture must still read when converted
> to black and white and darkened heavily. Leave the left third visually quiet.

**Then:** set `image.src` to `/cards-images/about-banner.png` in the `<PageBanner>` call.

---

## 2. `about-reception.png` — "Who we are", the wide frame

**1200 × 900 (4:3).**

The establishing shot of the section. Its whole argument is *ordinary morning*, not crisis.

> The reception area of a small refugee advice office on an ordinary weekday morning. Six or
> seven people of different ages waiting on tubular-steel chairs along a wall — a man reading a
> folded newspaper, a woman with a small child on her lap, an older woman in a headwrap, a young
> man looking at his phone. A staff member in a lanyard stands at a low counter with a ring
> binder open in front of her. Daylight from a large window on the left across a scuffed vinyl
> floor. Nobody is distressed; nobody is performing. Wide, eye-level, taken from the doorway.

---

## 3. `about-desk.png` — "Who we are", the square inset

**900 × 900 (1:1).**

Sits overlapping the lower-right corner of the frame above, at about 40% of its width, with a
white border. Small on screen, so it needs **one** clear gesture and no background clutter.

> Two people at a desk in a small office, seen from the side at close range: a caseworker in her
> thirties turned towards an older man, a paper form and a pen on the desk between them, her
> finger resting on a line of the form as she explains it. Both are looking down at the paper,
> not at each other and not at the camera. Warm window light from behind them, the background
> falling away into a plain wall and a filing cabinet. Tight, quiet, unhurried.

---

## 4. `about-team.png` — "How we work", the tall frame

**900 × 1200 (3:4).**

Sits on the near-black band (`bg-ink-950`), so key it **darker** than the other three — a bright
image will punch a hole in the section. It is the only frame with visible staff as a group.

> Four or five staff members of a small non-profit standing and sitting informally in their own
> office at the end of the day, mid-conversation: one perched on a desk edge, one holding a
> folder, one leaning in the doorway. A whiteboard with faint unreadable marks behind them, a
> window on one side with the last of the daylight. Dark, low-key exposure — deep shadow across
> most of the frame with light catching only faces and shoulders. Vertical, full-length, taken
> from across the room. Working, not posing for a team photograph.

**Then:** replace the `<ReservedFrame dark … />` with the `<Image>` — it is inside
`Reveal delay={150}` in the "how we work" section.

---

## Swapping a frame in

`ReservedFrame` is a local component at the bottom of `about/page.tsx`. Each one becomes:

```tsx
<Image
  src="/cards-images/about-reception.png"
  alt="People waiting in the reception area of the office"
  fill
  sizes="(min-width: 1024px) 45vw, 100vw"
  className="object-cover object-center"
/>
```

The parent already carries the aspect ratio, `relative` and `overflow-hidden`, so nothing else
changes. `alt` is read aloud — say what the picture *shows*, never "about us image".
