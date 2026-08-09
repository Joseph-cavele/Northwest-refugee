# CLAUDE.md — NWHR Front-End

Guidance for Claude Code (and any AI agent) working in this repository.

## What this is

The React SPA for **North West House of Refuge (NWHR)**, a nonprofit in Rustenburg,
North West Province, South Africa, serving refugees, asylum seekers and migrants.
Mission: *Empowering. Integrating. Transforming Lives.*

Two audiences in one app:

- **The staff dashboard** — beneficiary intake, casework, programmes, finance,
  fundraising. Permission-gated, behind a login.
- **The public site** — who NWHR is, and how to get help. No account required, ever.

**This interface displays special personal information about vulnerable people.**
Permit numbers, immigration status and vulnerability flags belong to people whose
safety can depend on that data staying private. A screen that renders one of those
fields where it should not is the same failure as an API that returns it. Treat any
change touching beneficiary data, auth, or what is shown to whom as high-stakes.

The API is the authority on everything. This app renders and collects — it never
decides. See `../Backend/CLAUDE.md` and `../Backend/API.md`.

## Stack

- **React 19**, TypeScript (strict), Vite 7
- **Tailwind CSS v4** via `@tailwindcss/vite` — no `tailwind.config.js`; tokens live in
  `@theme` in `src/styles/globals.css`
- **react-router-dom 7** (`BrowserRouter`)
- shadcn-compatible layout (`components.json`), `cn()` = clsx + tailwind-merge
- `lucide-react` for UI icons, `react-icons` for brand/social marks
- No state library. Server state is fetched per screen; shared client state is React
  Context.

```bash
npm run dev        # vite, port 5173, proxies /api -> localhost:5000
npm run build      # tsc -b && vite build
npm run typecheck
npm run lint
```

## Non-negotiables

### The access token is memory-only

`localStorage` and `sessionStorage` are **blocked by an eslint rule**
(`no-restricted-globals` in `eslint.config.js`). Persisting the access token is the one
mistake that turns an XSS into a stolen session on a system holding minors' identity
documents. The refresh token is an httpOnly cookie the JS never sees — which is why
every request sets `credentials: 'include'`.

Do not "fix" a lost-session-on-refresh bug by writing the token to storage. The fix is
to call `POST /auth/refresh` on boot.

### Never widen what the server narrowed

Several server behaviours look like UX bugs and are not. Do not smooth them over:

| Behaviour | Why |
|---|---|
| Login fails identically for wrong password, unknown email and disabled account | Account enumeration |
| `POST /auth/access-requests` returns the same sentence every time | Reveals who works here |
| Out-of-scope records return **404, not 403** | A 403 confirms the record exists |
| `forgot-password` always succeeds | Same oracle |

If a screen makes one of these distinguishable, that is a security regression, however
much friendlier it reads.

### Money is integer cents

`src/lib/money.ts` — parse with `parseCents()`, display with `formatZAR()`, and send
**strings** (`centsToInput()`) in request bodies. The literal `1.005` is already
`1.00499999999999989` before any code sees it. Never do arithmetic on rands.

### Dates render in Africa/Johannesburg

`src/lib/dates.ts`, always. `toISOString().slice(0,10)` is wrong here: it converts to
UTC first, so anything before 02:00 SAST lands on the previous day — and a date of
birth off by one is a beneficiary who is suddenly seventeen.

### Enums mirror the server

`src/types/enums.ts` is a copy of `Backend/src/config/constants.js`. These are wire
values. When one changes on the server it changes here in the same commit, or a select
offers an option that 422s.

## Routing

`src/routes/paths.ts` is the single source of truth. **Two paths are not free choices:**

```
/accept-invite?token=…     ← built by the server into the invitation email
/reset-password?token=…    ← built by the server into the reset email
```

Both are already in people's inboxes. Moving them under `/auth` 404s every outstanding
invitation. See `Backend/src/modules/notifications/email.service.js`.

Deployment must serve `index.html` for unmatched paths, or a refresh on any route is a
404 from the static host before React loads.

## Layout

```
src/
├── api/            errors.ts · client.ts · <module>.api.ts   the only place fetch is called
├── auth/           AuthScreen, guards, pages/
├── components/
│   ├── ui/         kebab-case, shadcn-compatible primitives
│   ├── forms/      composed inputs (money, phone, date)
│   └── feedback/   toasts, error boundary, empty states
├── dashboard/<module>/{pages,components}/
├── public-site/
├── hooks/          useSubmit, useDebounce, usePagination
├── lib/            utils (cn) · site · money · dates · format · phone
├── routes/         paths.ts + the route table
├── styles/         globals.css — @theme lives here
└── types/          enums.ts · api.d.ts · models.d.ts
```

**Naming:** `components/ui/` is kebab-case, because that is what the shadcn CLI
generates and mixing cases on a case-insensitive filesystem produces TS1261 build
errors. Everything else is PascalCase for components. Do not add `Button.tsx` next to
`button.tsx`.

**Layering:** pages own routing and navigation; `components/ui` owns appearance and
knows nothing about the router; `api/` owns transport. A component in `ui/` that
imports `useNavigate` is in the wrong place.

## The design system

The palette is **sampled from `public/Assets/logo.png`**, not chosen:

```
blue #344CB7   orange #F28529   yellow #FDD731   red #DB1B1D   black #000000
```

The mark is a black house sheltering four figures in those colours. So the interface is
black-and-white, blue carries primary action, and the rest appear as the four-colour
rule (`.brand-rule`) and as status colour where the meaning already fits.

**Contrast, checked:** white on `brand-500` is 7.3:1 (AAA). White on `accent-500`
(orange) is **2.6:1 and fails** — orange is for fills and icons, and any text on it must
be `ink-900`. Gold is the same. Only blue and red carry white text.

If the logo is redrawn, re-sample rather than eyeball. The whole interface hangs off
those five values.

**Accessibility is part of done:** real `<label>`s (never placeholder-only), visible
focus rings, colour never the sole signal, and `role="alert"` reserved for things the
user must act on — `role="status"` for confirmations.

## Conventions

**Fetching** — `api.get/post/patch` from `src/api/client.ts`. It unwraps
`{ success, data }` and throws `ApiError` with `code`, `details` and `requestId`.
Switch on `code`, never on message text.

**Forms** — `useSubmit()` for the busy/error/field-error triplet. When the server
returns `details`, those render under their inputs and the top-level banner stays empty;
showing both says the same thing twice.

**Errors on screen** — always surface `requestId`. It is what lets support find the log
line without the user having to describe someone's immigration status over the phone.

**Comments** — explain *why*, not *what*. Match the register of the existing ones: they
flag non-obvious constraints rather than narrating the code.

**Language** — South African English in user-facing copy (*enrolment*, *organisation*,
*programme*).

## Roles and pillars

`EXECUTIVE_DIRECTOR`, `ADMIN_OFFICER`, `PROJECT_COORDINATOR`, `FINANCE_OFFICER`,
`COMMS_OFFICER`, `ME_OFFICER`, `PEER_LEADER`, `VOLUNTEER`

`ADVOCACY_DOCUMENTATION` · `SKILLS_ENTREPRENEURSHIP` · `EDUCATION` · `SOCIAL_COHESION` ·
`WOMEN_YOUTH_EMPOWERMENT`

Permission checks in the UI decide **what to render**, nothing more. The server decides
what is allowed, and a client-side check that is wrong shows an empty screen and a 403 —
never unauthorised data.

## Auth, end to end

```
sign-in ──password ok──────────────► session ──► dashboard
        └─mfa enabled─► /auth/mfa ─► session ──► dashboard

request access ─► admin approves ─► invite email ─► /accept-invite?token ─► session
forgot password ─► reset email ─────────────────► /reset-password?token ─► sign in again
```

`AuthProvider` owns the session; `tokenStore` holds the access token in a module
variable so `api/client.ts` can read it without a hook. On boot the provider spends the
refresh cookie for a new access token, then loads `/auth/me`. Until that settles the
status is `loading`, and `RequireAuth` renders a spinner — **not** a redirect, or every
reload would bounce a signed-in user to the login screen.

**The refresh is single-flight, and that is load-bearing.** The server rotates the
refresh token on every use and revokes the whole family if an already-rotated one is
presented. Two concurrent refreshes — a dashboard firing several requests at once, or
StrictMode double-invoking the boot effect — would look exactly like a stolen token and
sign the user out of every device. `refreshSession()` in `api/client.ts` is the only
caller; do not add another.

Credential endpoints pass `anonymous: true`. Without it a 401 from a wrong password
would trigger the retry, resubmitting the same bad password and burning two of the five
attempts before lockout.

Reset does **not** sign you in: it bumps `tokenVersion` and revokes every session, so
the only correct ending is "now sign in". Accepting an invitation does.

## Current state

Built: the design system, the API client with refresh-retry, the full auth flow
(provider, guards, sign-in, MFA, request access, invitation, password recovery), the 404
page, and the dashboard shell — `DashboardLayout` + `Sidebar` + `TopBar`, with an
Overview page reading `GET /reports/cards`.

**The role landing routes are derived, never listed.** The server sends `dashboard` with
the session (`Backend/src/config/constants.js`), and `routes/dashboardRoutes.tsx`
generates a route for every value in `DASHBOARD_BY_ROLE` rather than hard-coding the
eight. That is not tidiness: a landing route the server hands out and the client does not
have is a *successful* login that ends on the 404 page, with nothing in any log to say
so. Adding a role must not be able to reintroduce it.

All eight land on the same Overview, because `/reports/cards` already returns exactly
what the caller's role may see — a per-role page would be a second copy of the permission
matrix, and the copy that drifts is the one that leaks. A card the user may not see is
**absent from the response, never zero**; do not fill the gap with a zero, which states
something untrue.

**Not built:** every feature dashboard module (beneficiaries, cases, finance,
fundraising, programmes…), the public site, toasts, and the error boundary. The `NAV`
list in `layouts/Sidebar.tsx` holds Overview alone — add an entry in the same commit as
the page it points at, because a nav full of links to unbuilt pages reads as a broken
system rather than an unfinished one. Many files under `src/` are still empty scaffolding
— an empty file is a placeholder, not a deleted feature.

Known gaps worth fixing early:

- **`@types/node` is missing.** `tsconfig.node.json` sets `"types": ["node"]` for
  `vite.config.ts`, but the package is not in `devDependencies` — so `npm run build` and
  `npm run typecheck` both fail on a clean install with TS2688. `npx vite build` and
  `tsc -p tsconfig.app.json` are clean; it is only the `vite.config.ts` project. Install
  it rather than deleting the `types` entry.

- `public/Assets/logo.png` is a **1.4 MB** 1024×1024 PNG on the login screen. Export a
  128/256px WebP.
- `SOCIAL_LINKS` in `src/lib/site.ts` are placeholder URLs.
- `npm audit` reports pre-existing highs in `react-router`, `nanoid`, `brace-expansion`.
