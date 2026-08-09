# CLAUDE.md — NWHR

Guidance for Claude Code (and any AI agent) working in this repository.

## What this is

The whole of **North West House of Refuge (NWHR)** — a nonprofit in Rustenburg, North West
Province, South Africa, serving refugees, asylum seekers and migrants — as one Next.js 16
application. Mission: *Empowering. Integrating. Transforming Lives.*

Two audiences, one deployment:

- **The staff dashboard** — beneficiary intake, casework, programmes, finance, fundraising.
  Permission-gated, behind a login.
- **The public site and help guide** — who NWHR is, and how to get help. No account, ever.

**This system holds special personal information about vulnerable people.** Permit numbers,
immigration status and vulnerability flags belong to people whose safety can depend on that
data staying private. Treat every change touching beneficiary data, encryption, audit
logging or access control as high-stakes. When in doubt, ask rather than assume.

## The port from Express + Vite

This was two applications — an Express 5 API in `Backend/` and a Vite SPA in `Front-End/`.
Both directories are still on disk, unmodified, as the reference. **They are not built, not
linted and not deployed.** Delete them once you are satisfied nothing was lost.

What actually moved, and what did not:

| Layer | Fate |
|---|---|
| models, schemas, services, utils, config, jobs | **Carried over unchanged** into `src/server/` |
| `*.routes.js` + `*.controller.js` (162 endpoints) | Rewritten as Route Handlers under `src/app/api/v1/` |
| `middleware/` (authenticate, authorize, validate, errorHandler, requestId, catchAsync) | Collapsed into one `route()` wrapper — `src/server/http/route.js` |
| `app.js` / `server.js` | Gone. Next owns the server |
| `express-rate-limit` | Rewritten — `src/server/http/rateLimit.js` |
| `multer` | Replaced by `FormData` — `src/server/http/upload.js` |
| `node-cron` | Replaced by `/api/v1/cron/[job]` + `vercel.json` |
| React Router | Replaced by the App Router file tree |

**`src/server/` is still plain JavaScript.** That is deliberate — `Backend/CLAUDE.md` said
"no TypeScript, no build step", and half of that could not survive becoming a Next app.
Keeping the language kept ~7 500 lines of service logic from being retyped in the same
change that swapped web framework. Do not convert it wholesale; it earns nothing.

## Stack

- **Next.js 16** (App Router, Turbopack), React 19, TypeScript (strict) on the client
- **Plain JavaScript** in `src/server/`
- Mongoose 9 · MongoDB Atlas (`af-south-1` / Cape Town for data residency)
- Tailwind CSS v4 via `@tailwindcss/postcss` — tokens live in `@theme` in `src/styles/globals.css`
- zod for all input validation · JWT auth with permission-based RBAC
- Cloudinary (authenticated delivery), Resend (email), Meta WhatsApp Cloud API, OpenAI
  (intent classification only), Paystack (the only gateway)

```bash
npm run dev        # next dev, port 3000
npm run build      # next build
npm start          # next start
npm run lint
npm run typecheck
```

Copy `.env.example` to `.env`. `src/server/config/env.js` validates every variable with zod
and **throws** with a readable list — it no longer calls `process.exit(1)`, because on a
serverless runtime that kills an instance for what is a configuration problem.

## Architecture

```
src/
├── app/
│   ├── api/v1/**/route.js     the API — one directory per URL segment
│   ├── (pages)                 auth screens, dashboard, public site
│   └── layout.tsx              AuthProvider wraps the router
├── server/                     the API's brain — no React, no Next imports below http/
│   ├── config/                 env, logger, db, cloudinary, constants, permissions, uploads
│   ├── http/                   route(), respond, errors, rateLimit, upload
│   ├── modules/<name>/         <name>.model.js · .schema.js · .service.js
│   └── jobs/                   the three scheduled jobs, triggered over HTTP
├── api/                        client-side fetch layer (client.ts + <module>.api.ts)
├── auth/ components/ hooks/ lib/ layouts/ types/    the client
└── styles/globals.css          @theme lives here
```

**Strict layering, unchanged from Express:**

```
route.js → route() [auth, permission, validation] → service → model
```

- **Route handlers never import a Mongoose model.** They call services and shape the
  response. Nothing else.
- **Services hold all business logic** and are the only layer that touches models.
- **Routes declare permissions**, never role names: `route({ permission: PERMISSIONS.TRANSACTION_APPROVE }, …)`.
- Cross-module access is service → service, except the read-only lookups already present
  (`reports/report.service.js` counts across collections and says why in its header).

New endpoint? Create `src/app/api/v1/<path>/route.js`, export `GET`/`POST`/`PATCH`/`DELETE`
wrapped in `route()`. There is no route table to register it in — the directory is the URL.

## Non-negotiable invariants

Break any of these and the system stops being trustworthy to an auditor, a donor, or a
beneficiary. **Every one of them survived the port unchanged.**

### The access token is memory-only
`localStorage` and `sessionStorage` are **blocked by an eslint rule**. Persisting the access
token is the one mistake that turns an XSS into a stolen session on a system holding minors'
identity documents. The refresh token is an httpOnly cookie the JS never sees. Do not "fix"
a lost-session-on-reload bug by writing to storage — the fix is `POST /api/v1/auth/refresh`
on boot, which `AuthProvider` already does. The MFA challenge token is held the same way
(`src/auth/mfaChallengeStore.ts`) because the App Router has no router-state channel and a
challenge token in a URL lands in history, Referer and every proxy log.

### Money
- **Integer cents. Never floats.** zod accepts rands; services call `toCents()` immediately.
- `Transaction` amounts are always positive. Direction is `type`, never the sign.

### Financial controls
- **The creator can never approve their own transaction or budget.** Enforced in
  `finance.service.js`, not only in the role table.
- Amounts above the approver's ceiling escalate to the Executive Director.
- **Posted transactions are immutable.** Corrections are reversals, which write a matching
  entry. Never edit or delete a posted row.
- A custodian cannot reconcile their own petty cash float.

### POPIA / privacy
- Permit numbers are encrypted at rest (AES-256-GCM) with an HMAC blind index for lookup.
  Never plaintext, never logged.
- `vulnerabilityFlags` and `immigration.permitNumber` are `select: false` and load only
  behind `beneficiary:read_sensitive` — and **reading them writes an audit entry**.
- Consent is captured **before** any personal data is stored.
- A beneficiary under 18 cannot be registered without a recorded guardian.
- Documents are private: signed, time-limited Cloudinary URLs only.
- Out-of-scope records return **404, not 403** — a 403 confirms the record exists.
- Login, `forgot-password` and `access-requests` answer identically whatever the truth is.
  If a screen makes those distinguishable, that is a security regression however much
  friendlier it reads.

### Audit
`AuditLog` is **append-only** — update and delete are blocked at the model layer. Audit
writes are best-effort and must never break the request they record.

### Webhooks
- **Paystack** — HMAC-**SHA512** over the raw body, not SHA256. Four gates before money
  counts: signature → known reference → server-to-server verify → amount and currency match.
- **WhatsApp (Meta)** — HMAC-**SHA256** over the raw body. The `GET` handshake must echo
  `hub.challenge` as **plain text**; a JSON envelope fails with only a generic error.
- Both read `await request.text()` and are deliberately **not** wrapped in `route()` — a
  parsed-and-reserialised body cannot reproduce the digest. Both fail closed when the secret
  is unset.
- Both reply immediately and process inside `after()` from `next/server`. This is
  load-bearing: Express could keep working after `res.sendStatus(200)` because the process
  lived on; a serverless invocation ends when the response is returned, and unawaited work
  is killed mid-flight.

### AI usage
OpenAI maps free text onto a fixed option list and nothing else. It never invents field
values. Do not expand its role without discussing it first.

## Scheduled jobs

`node-cron` held a timer inside a long-lived process; there is no such process now. The job
functions are unchanged in `src/server/jobs/`; the trigger is `POST /api/v1/cron/[job]`,
guarded by `CRON_SECRET` in constant time and **failing closed when it is unset** — these
are public URLs, and one of them messages every beneficiary with an expiring permit.

`vercel.json` holds the schedule **in UTC**, converted from the Africa/Johannesburg times
`jobs/index.js` used to declare (SA observes no daylight saving, so the offset is fixed).

## Known gaps

- **`ENCRYPTION_KEY` is not set in `.env`.** `utils/encrypt.js` throws on first use, so
  creating a beneficiary with a permit number will fail. Generate with `openssl rand -hex 32`.
  Rotating it makes every stored permit number undecryptable.
- **The rate limiter is per-instance and in memory.** That was fine for one Express process
  and is not fine for N serverless instances: the effective limit is N × the number
  configured, and a cold start resets a bucket. The broad `/api` limiter tolerates this; the
  credential limiters do not. Move them to a shared store (Redis/KV/Mongo TTL) before
  go-live. The per-account five-failure lockout in `auth.service.js` is unaffected and is
  the real backstop.
- **The 405-test suite in `Backend/tests/` has not been ported.** It is built on supertest
  against the Express `app` object, which no longer exists. The invariants it protects —
  self-approval rejection, webhook idempotency, sensitive-read auditing, consent-declined
  leaving no trace — are worth re-establishing against the route handlers.
- **Atlas is writing to a database literally named `test`** (no database in `MONGO_URI`'s
  path). See the note in `API.md`.
- **No Content-Security-Policy.** `next.config.mjs` sets the other headers; a nonce-based
  CSP belongs in `middleware.js`.

## Roles and pillars

`EXECUTIVE_DIRECTOR`, `ADMIN_OFFICER`, `PROJECT_COORDINATOR`, `FINANCE_OFFICER`,
`COMMS_OFFICER`, `ME_OFFICER`, `PEER_LEADER`, `VOLUNTEER`

`ADVOCACY_DOCUMENTATION` · `SKILLS_ENTREPRENEURSHIP` · `EDUCATION` · `SOCIAL_COHESION` ·
`WOMEN_YOUTH_EMPOWERMENT`

Volunteers and peer leaders see only records they captured. Coordinators are scoped to their
assigned programmes. Permission checks in the UI decide **what to render**, nothing more.

## Conventions

**Errors** — throw `AppError` (`AppError.notFound('Beneficiary')`, `AppError.selfApproval()`).
`route()` is the only place an error becomes a response.

**Responses** — `success` / `created` / `noContent` / `paginated` from `server/http/respond.js`.
Envelope is `{ success, data, meta }`; errors are `{ success: false, error, requestId }`.

**Validation** — declare `body` / `query` / `params` schemas on `route()`. Field errors from
all three parts are collected into one `VALIDATION_FAILED` so a form can map them onto inputs.

**Language** — South African English in user-facing copy (*enrolment*, *organisation*,
*programme*). Beneficiary-facing strings live in `whatsapp/prompts.js`, keyed by language.

**Comments** — explain *why*, not *what*. Match the register of the existing ones: they flag
non-obvious constraints rather than narrating the code.
