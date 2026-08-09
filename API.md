# NWHR API — how it works

The API for **North West House of Refuge**, a nonprofit in Rustenburg serving refugees,
asylum seekers and migrants. It is served by the same Next.js application as the dashboard
and the public site — `/api/v1/**` are Route Handlers under `src/app/`. This document
explains the request flow, the rules that hold across every module, and what each group of
routes does.

`CLAUDE.md` is the short version for anyone (or anything) writing code here. This is the
long version for someone trying to understand the system.

---

## 1. The shape of a request

Every request goes through the same pipeline. **It is now one function, not a chain of
middleware** — `route()` in `src/server/http/route.js`:

```
route({ auth | permission, body, query, params }, handler)
  │
  ├─ requestId          read or mint; echoed in x-request-id and every error body
  ├─ connectDB          cached + single-flight; there is no boot step to have opened it
  ├─ authenticate       Bearer → User, or 401
  ├─ authorize          permission check; denials are audited before the 403
  ├─ sanitize           strips $-prefixed, dotted and __proto__ keys
  ├─ validate           zod over body/params/query; all field errors in one response
  ├─ handler            → service → model
  └─ toErrorResponse    the ONLY place an error becomes a response
```

Five middlewares became one wrapper because a Route Handler has no `next()` to chain
through, and five hand-rolled wrappers would be five chances to compose them in the wrong
order on one route out of a hundred. Declaring the permission on the export keeps the
property that mattered: a route's guard is visible at the top of the file it guards, and
`assertKnownPermission` still runs at module load, so a typo is a boot-time error rather
than a route that silently denies everyone.

**`requestId`** stamps every request with an id, echoes it in `x-request-id`, and puts it
in the error body. A donor quoting that id from a failure screen lets support find the
exact log line without either of them describing personal details. An inbound id is
accepted only as an opaque token (`[A-Za-z0-9._:-]{1,128}`) — the header is
attacker-controlled and ends up in the logs.

**Webhooks are deliberately NOT wrapped in `route()`.** Paystack and Meta sign the raw
request bytes; a parsed-and-re-serialised body cannot reproduce the digest. Under Express
this meant `rawBody` had to be mounted above `express.json()` and the ordering was fragile.
A Route Handler never parses a body it is not asked to, so the handlers just call
`await request.text()` — the hazard is gone, the requirement is not.

**Query strings keep repeated keys.** `?key=a&key=b` arrives as `['a','b']`;
`Object.fromEntries(searchParams)` would silently keep only the last, which the metrics
series depends on.

**`toErrorResponse` is the only place errors are formatted.** Nothing else builds an error
response — which is what lets the envelope below be a guarantee rather than a convention.

### The two response shapes

```jsonc
// success
{ "success": true, "data": { … }, "meta": { … } }   // meta only on paginated lists

// error
{ "success": false, "error": { "code": "…", "message": "…", "details": { … } },
  "requestId": "…" }
```

`details` is field-keyed, so a form can map errors straight onto inputs. Clients switch on
`error.code`, never on message text.

---

## 2. Layering

```
src/app/api/v1/**/route.js  →  route()  →  service  →  model
```

- **Route handlers never import models.** They call services and shape the response.
- **Services hold all business logic** and are the only layer that touches models.
- **Routes declare permissions**, never role names.
- **Cross-module access is service → service.** `document.service` calls
  `beneficiary.service.getBeneficiaryById()` rather than querying the Beneficiary model,
  because that function is where row-level scoping lives. The one sanctioned exception is
  `reports/report.service.js`, which counts read-only across nine collections and explains
  why in its header.

A module is now **three** files in `src/server/modules/<name>/` — `<name>.model.js`,
`.schema.js`, `.service.js`. The controller and routes files are gone: their contents live
in `src/app/api/v1/<path>/route.js`, where the directory tree *is* the URL. There is no
route table to register anything in.

**The directory tree replaced route ordering.** Express matched in declaration order, so
`/permits/expiring` had to be declared before `/:id` or it arrived as `id='permits'`. The
App Router always prefers a literal segment over a dynamic one, so that class of bug is
gone — but the URLs are unchanged, and the reasons the paths were shaped that way still
apply.

---

## 3. Authentication and authorisation

**Two-token scheme.** A short-lived access JWT is held in SPA memory and sent as a Bearer
header. A long-lived opaque refresh token lives in an httpOnly cookie scoped to
`/api/v1/auth`; only its SHA-256 hash is stored.

**Rotation with reuse detection.** Every refresh issues a new token in the same *family*
and revokes the old one. Presenting an already-rotated token means it leaked, so the entire
family is revoked — the thief and the victim are both signed out — and
`auth.refresh_reuse_detected` is written to the audit trail.

**`tokenVersion`** is stamped into every access token. A password reset increments it,
which invalidates already-issued stateless access tokens immediately rather than waiting
for them to expire.

### Permissions, not roles

`config/permissions.js` is the single source of truth. A route says
`route({ permission: PERMISSIONS.TRANSACTION_APPROVE }, handler)`. A typo'd permission
string throws at module load rather than silently denying everyone — which would look like
a broken login.

The eight roles: `EXECUTIVE_DIRECTOR`, `ADMIN_OFFICER`, `PROJECT_COORDINATOR`,
`FINANCE_OFFICER`, `COMMS_OFFICER`, `ME_OFFICER`, `PEER_LEADER`, `VOLUNTEER`.

### Row-level scoping

A permission answers *"may they call this route"*. Scoping answers *"which rows"*. Both
are required — a route guard alone leaves the rest of the register one request away.

- **Coordinators** are narrowed to their assigned programmes (`User.programmes`).
- **Peer leaders and volunteers** see only records they captured.
- Everyone else reads across the organisation.

Out-of-scope records return **404, not 403**. Confirming a record exists but is not yours
confirms that person is on the register.

> **Known inconsistency.** `cases`, `education`, `enrollments` and `events` scope as
> *"your programmes **OR** you captured it"*, because otherwise the person who created a
> record could not read it back. The **beneficiary register does not** — a coordinator
> cannot see someone they just registered until that person is attached to one of their
> programmes. That is CLAUDE.md's documented rule, so it has been left alone deliberately,
> but it is an operational gap worth an explicit decision.

---

## 4. Rules that hold everywhere

### POPIA

This system holds minors' and refugees' identity documents. The controls are structural,
not advisory:

| Control | Where |
|---|---|
| Permit numbers encrypted (AES-256-GCM) with an HMAC blind index for lookup | `utils/encrypt.js` |
| `immigration.permitNumber` and `vulnerabilityFlags` are `select: false` | `beneficiary.model.js` |
| Reading them requires `beneficiary:read_sensitive` **and** writes a `SENSITIVE_READ` audit entry | `beneficiary.service.js` |
| Consent captured before any personal data is stored; withdrawal blocks new work | throughout |
| A beneficiary under 18 cannot be registered without a guardian | `beneficiary.model.js` |
| Documents delivered by signed, expiring URLs only | `config/cloudinary.js` |
| Logs redact permits, IDs, phones, emails, tokens; serialisers allowlist headers | `config/logger.js` |
| Chatboard refuses any 13-digit SA ID number | `chatboard.schema.js` |
| Event registers store demographics, not names, unless consent is recorded | `event.model.js` |

**The blind index leaks equality** — someone with database access can test whether a
*guessed* permit number is present. That is the accepted price of finding a person by
permit at the front desk.

### Audit

`AuditLog` is append-only, enforced by model hooks that block every update and delete.
Writes are best-effort and never break the request they record. `meta` carries references
and counts — never names, permit numbers or document contents.

### Money

Integer cents everywhere; every field ends in `Cents`. zod accepts rands at the boundary,
the service calls `toCents()` immediately, and only `toRands()`/`formatZAR()` go out.

**Prefer strings for amounts.** The literal `1.005` is already `1.00499999999999989` as a
double before any code sees it; `"1.005"` parses exactly to 101 cents. `allocate()` splits
an amount across weights without losing a cent — R100 three ways is `[3334, 3333, 3333]`,
not three lots of 33.33.

### Derived values are never writable

`raisedCents`, `totalGivenCents`, `recordedAttendance`, `enrolledCount` and
`fulfilledCents` are stripped from every PATCH. A total that can be typed in is not a
total.

---

## 5. The routers

All are mounted under `/api/v1` and require authentication.

### `/auth` — sessions and staff accounts

| | |
|---|---|
| `POST /login` | Password stage. Returns tokens, or an MFA challenge. |
| `POST /mfa/verify` | Exchange the challenge + TOTP code for tokens. |
| `POST /refresh` | Rotate the refresh cookie, mint a new access token. |
| `POST /logout` · `/logout-all` | Revoke one session, or all of them. |
| `POST /accept-invite` | Set the first password and activate the account. |
| `POST /forgot-password` · `/reset-password` | Recovery. |
| `GET /me` | The authenticated user. |
| `POST /invite` | `user:invite` — create an account and email the link. |
| `POST /mfa/enroll` · `/mfa/enable` | TOTP setup. |

Unknown accounts and wrong passwords fail identically. Five failures lock the account.
Email sends are non-fatal: an invite whose email fails still returns 201 with
`emailSent: false`, and `forgot-password` responds identically whether or not the account
exists — a 500 on one path and a 200 on the other would be an enumeration oracle.

### `/beneficiaries` — the register

| | |
|---|---|
| `POST /` · `GET /` | `beneficiary:create` / `:read` |
| `GET /:id` · `PATCH /:id` · `DELETE /:id` | Soft delete only |
| `GET /:id/sensitive` | `beneficiary:read_sensitive` — decrypts the permit, writes an audit entry |
| `POST /permits/lookup` | Blind-index lookup. **POST** so the permit stays out of URLs and logs |
| `GET /permits/expiring` | Scoped queue — deliberately *not* the unscoped cron query |

Intake enforces consent, a guardian for minors, and E.164 phone normalisation. A new
record enters as `PENDING_VERIFICATION`, not `DRAFT` — otherwise the verification queue
and the expiry job are permanently empty.

### `/documents` — identity documents

| | |
|---|---|
| `POST /` | multipart; memory-only, never written to disk |
| `GET /?beneficiary=…` | **Required** filter, so access is checked exactly |
| `GET /:id/download` | `document:download` — a separate permission from read |
| `DELETE /:id` | Soft delete; the stored file is retained |

Content is sniffed from the leading bytes, so an executable renamed `.jpg` is refused
before it reaches storage. Downloads return a **signed URL expiring in 5 minutes**,
generated per request and never persisted. Uploading an `ASYLUM_PERMIT` or `REFUGEE_ID`
links it to `beneficiary.immigration.documentId`.

> `cloudinary.url(…, { expires_at })` **silently ignores the expiry**. Only
> `utils.private_download_url()` produces a genuinely time-limited URL.

### `/cases` — the ongoing case file

`POST /` · `GET /` · `GET /urgent` · `GET /:id` · `PATCH /:id` · `POST /:id/assign` ·
`POST /:id/status` · `POST /:id/close`

A **case** is the relationship a staff member owns; a **service request** is one ask inside
it. One active case per beneficiary (partial unique index). `GET /urgent` is HIGH+URGENT
and still open, **oldest first** — the case that has waited longest is the one at risk.
Closing is final and requires an outcome; a returning beneficiary gets a new case.

### `/service-requests` — individual asks

`POST /` · `GET /` · `GET /:id` · `PATCH /:id` · `POST /:id/assign` · `POST /:id/status`

Carries a category, a pillar snapshot and an SLA due date derived from urgency. Status has
its own endpoint so an invalid transition is refused rather than written. `RESOLVED`,
`REFERRED` and `CANCELLED` are terminal — a request that can be resolved twice inflates
every throughput figure. Assigning moves `OPEN → IN_PROGRESS`.

### `/referrals` — the onward handover

`POST /` · `GET /` · `GET /:id` · `PATCH /:id` · `POST /:id/status`

Where a service request that ends `REFERRED` points. The organisation lives here, never on
the request. `direction` is `OUTBOUND` (NWHR disclosing) or `INBOUND` (a partner sending
someone to us — the `REFERRAL` intake channel).

**An outbound referral carries its own consent.** Agreeing to be on the register is not
agreeing to be discussed with an outside organisation, so `informationSharing` records a
second consent — given, method, policy version, who witnessed it — and the model refuses
the write without it. Inbound referrals do not need one: that disclosure was the partner's.
Nothing sensitive is copied onto the record either; it holds a reference to the person, not
their permit number or vulnerability flags.

`PENDING → ACCEPTED → COMPLETED`, with `DECLINED`, `CANCELLED` and `LOST_TO_FOLLOW_UP`
reachable throughout. `DECLINED` is reachable from `ACCEPTED` on purpose — a partner who
accepted the paper referral can still turn someone away at the counter. Terminal is final
and every outcome needs a note: a second attempt is an honest second record, which is what
keeps a partner's decline rate true. `followUpAt` derives from urgency on the same
standards as a service request's SLA, so `?overdue=true` is "nobody has chased this".

A `case` or `serviceRequest` link is checked against the beneficiary before the write —
filing a referral under someone else's case makes two histories wrong at once.

### `/programmes` — the schedule

`POST /` · `GET /` · `GET /:id` · `PATCH /:id` · `POST /:id/archive` ·
`POST|GET /:id/cohorts` · `GET|PATCH /cohorts/:cohortId` ·
`POST|GET /cohorts/:cohortId/sessions` · `PATCH /sessions/:sessionId`

`Programme → Cohort → Session`. Pillar is frozen once a programme leaves `PLANNED`, since
moving a live one rewrites every historical figure grouped by it. Sessions must fall
within their cohort's dates. Archiving is refused while a cohort is still running.

> The programme session registers as **`ProgrammeSession`** — `Session` already belongs to
> auth's refresh-token lineages, and registering the name twice throws at import.

### `/enrollments` — people on cohorts, and attendance

`POST /` · `GET /` · `GET /:id` · `PATCH /:id` · `GET /:id/attendance` ·
`POST|GET /sessions/:sessionId/attendance`

Capacity is claimed with **one atomic conditional update**
(`$expr: { $lt: ['$enrolledCount', '$capacity'] }` plus `$inc`), because a read-then-write
check lets two officers both take the last seat. Withdrawing frees a seat; completing does
not. Registers upsert on `(session, beneficiary)`, so a corrected mark replaces the
original instead of inflating the denominator. `attendanceRate` is **null**, not 0, when
nothing has been marked.

`attendance:capture` is wider than `enrollment:create` — volunteers mark registers in the
field but cannot enrol anyone.

### `/education` — school placements and cooperatives

`POST|GET /placements` · `GET|PATCH /placements/:id` ·
`POST|GET /cooperatives` · `GET|PATCH /cooperatives/:id` ·
`POST /cooperatives/:id/members` · `DELETE /cooperatives/:id/members/:beneficiaryId`

`refusal.dueToLackOfDocuments` is the advocacy field: a South African school **may not**
refuse admission because a child lacks papers (*Centre for Child Law v Minister of Basic
Education*, 2019), so such refusals are unlawful and surface through
`GET /placements?unlawfulRefusalsOnly=true`.

Cooperatives cannot be marked `REGISTERED` below **five active members** — the
Co-operatives Act 14 of 2005 requires five natural persons, and recording fewer asserts
something CIPC never granted. Departing members keep their row with an exit date.

### `/events` — community events

`POST|GET /` · `GET|PATCH /:id` · `POST|GET /:id/participants` · `GET /:id/attendance`

An event register is **not** an intake. The default participant row stores gender and age
band and nothing that identifies anyone. A name or number is accepted only alongside an
explicit `consentToContact`; the number is stripped from every listing. Known beneficiaries
upsert so a re-submitted register does not double-count them. `recordedAttendance` is
recounted, never asserted.

### `/fundraising` — donors, campaigns, pledges, donations

`POST|GET /donors` · `GET|PATCH /donors/:id` ·
`POST|GET /campaigns` · `GET|PATCH /campaigns/:id` · `GET /campaigns/:id/totals` ·
`POST|GET /pledges` · `PATCH /pledges/:id` ·
`POST|GET /donations` · `GET /donations/:id` ·
`POST /donations/:id/settle` · `POST /donations/:id/receipt/resend` ·
`POST /donations/:id/refund`

**Settlement is idempotent**, because PayFast and Ozow retry as a matter of course. Two
layers: a unique partial index on `providerReference`, and a conditional update on
`status: 'PENDING'` so only the caller whose update actually matched moves the totals.

**Receipts.** Settling issues a s18A number and emails the donor. SARS requires a
certificate to carry the PBO approval number, the organisation's name and address, the
donor's details and tax reference, and the s18A certification — so without
`S18A_PBO_NUMBER` the system sends a plain acknowledgement instead. An invalid certificate
is worse than none, because a donor may claim against it. The send is best-effort:
`receiptEmailedAt` records whether it actually went, and `receipt/resend` re-sends
**without** issuing a new number.

**Refund reverses, never deletes.** The row stays as `REFUNDED` and every total unwinds by
exactly what settlement added.

### `/audit` — the trail

`GET /` · `GET /actions`

Read-only by construction — no write route exists, and the model blocks mutation. Held by
the Executive Director, Admin Officer and M&E Officer only. Denials are themselves audited
with the refused permission. Reading the trail is *not* audited: one row per page view
would bury what an auditor is looking for.

`targetId` is a Mixed path, so a hex string from a query parameter is matched as both a
string and an ObjectId — otherwise "everything that happened to this record" silently
returns nothing.

### `/chatboard` — internal staff board

`POST|GET /channels` · `GET|PATCH /channels/:id` · `POST /channels/:id/archive` ·
`POST|GET /channels/:id/messages` · `PATCH|DELETE /messages/:id`

Private channels 404 to non-members — the existence of a channel named "Safeguarding" is
itself information. Messages containing a 13-digit SA ID number are refused with a message
pointing at the beneficiary's NWHR code. Editing is author-only with **no manager
override**; `chatboard:manage` can delete anyone's message, and deletion is soft so the
thread still reads in order.

### `/reports` — dashboard cards and the metric series

`GET /cards` · `GET /metrics` · `GET /metrics/definitions` · `POST /snapshots`

Counts and totals only. No route here returns a beneficiary, a case or a transaction,
which is why the reporting permissions are held by roles that do not all hold
`beneficiary:read`.

**Two permissions, and they are not the same question.** `report:read` gets the dashboard
cards, which are filtered by the permission for the data behind each one and row-scoped to
the caller's own caseload — safe as a landing screen for every role that can reach it.
`metric:read` gets the stored series, which is organisation-wide by construction; a
coordinator reading it would see totals covering programmes they are not assigned to,
which is why they hold the first and not the second. Peer leaders and volunteers hold
neither and work from their own queues.

**A card the caller may not see is absent, not zero.** "0 open cases" is a claim about the
caseload; the truth is that they cannot see the caseload, and the two must not look alike
on a screen someone decides from. Each card carries `scoped`, saying whether the figure is
the caller's own caseload or the whole organisation — the UI cannot tell from the number.

**Card keys are metric keys.** The same measure appears as a live card (now, or
month-to-date) and as a stored daily row, so a card expands into its own history without a
second vocabulary in between.

**Stocks and flows are marked, because one of them must never be summed.** A `STOCK` is a
level at a moment ("open cases") — three days of twelve is twelve cases, not thirty-six. A
`FLOW` is an amount over a period ("cases closed") and does add up. The `kind` is stored on
every row so a chart can refuse the wrong total rather than rely on whoever built it having
known.

**Why anything is stored at all.** The cards count live rows and are always right about
now. They cannot answer "what did this look like in March", because the rows keep moving —
a case closed today leaves the open-case count and every past figure changes with it. A
funder's report is a claim about a date that has passed, so the number has to have been
written down on the day. `POST /snapshots` (`report:create`, the M&E Officer alone)
recomputes a day from the same source rows; there is no path anywhere for a reported figure
to be typed in by hand.

**Backfill is refused beyond two days.** A flow can be recomputed for any past date. A
stock cannot: nothing records that a case was open last Tuesday, only that it is closed
now, so backfilling would file *today's* level under an old date and rewrite history in the
one direction nobody would check.

**Breakdowns are coarse on purpose.** Pillar is the only dimension. Nationality, gender,
age band and vulnerability are absent by design — Rustenburg's refugee community is small
enough that "1 Somali woman, GBV survivor, October" identifies a person as surely as her
name would, and this table is read by roles holding no beneficiary access at all. Adding an
axis is a POPIA decision, not a schema change.

Days are **SAST calendar days** (`utils/dates.js`). Bucketing by UTC would file everything
captured between midnight and 02:00 under the previous day, and the WhatsApp bot runs all
night.

---

## 6. Scheduled jobs

`node-cron` kept a timer inside a long-lived Express process. There is no such process now,
so the schedule lives outside the application and pokes it:

```
POST /api/v1/cron/permit-expiry     07:00 SAST daily    before the front desk opens
POST /api/v1/cron/daily-rollup      00:30 SAST daily    after midnight, covers a closed day
POST /api/v1/cron/finance-alerts    08:00 SAST Monday   the finance week starts with what is outstanding
```

The job **functions** are unchanged in `src/server/jobs/`; only the trigger moved.
`vercel.json` holds the schedule in **UTC** (05:00, 22:30 the previous day, 06:00 Monday) —
SA observes no daylight saving, so that conversion is stable, but it is a conversion.

Guarded by `CRON_SECRET` as `Authorization: Bearer …`, compared in constant time and
**failing closed when the secret is unset**. These are public URLs and one of them messages
every beneficiary with an expiring permit; an unset secret must mean "nobody", never
"everybody".

Double-firing is unchanged: two instances receiving the same trigger run the job twice. The
scheduler calling once is what prevents that.

---

## 7. Not built yet

`users` — staff administration beyond the invitation flow. The files under
`src/server/modules/users/` are empty scaffolding.

`reports` covers dashboard cards and the daily metric series. Report *export* — a
funder-ready PDF or spreadsheet over a date range — is not built.

**The test suite has not been ported.** `tests/` holds 405 tests built on supertest
against the Express `app` object, which no longer exists. The invariants worth
re-establishing first, against the route handlers: self-approval rejection, budget overspend
rejection, webhook idempotency, sensitive-read auditing, and consent-declined leaving no
trace.

---

## 8. Running it

```bash
npm run dev     # next dev, port 3000
npm run build   # next build
npm start       # next start
npm run lint
npm run typecheck
```

`src/server/config/env.js` validates every variable and **throws** with a readable list —
it no longer calls `process.exit(1)`, which on a serverless runtime would kill an instance
over a configuration problem the platform would then retry forever. Empty values in `.env`
are treated as absent.

`ENCRYPTION_KEY` is optional at boot but `utils/encrypt.js` throws on first use — a missing
key must stop a write, never let a permit number through in the clear. **It is currently
unset**, so creating a beneficiary with a permit number will fail until one is generated
(`openssl rand -hex 32`). Rotating it makes every stored permit number undecryptable.

### The database is called `test`

`MONGO_URI` carries no database in its path, so the driver falls back to its default and
every beneficiary, transaction and audit row lives in a database named `test`. That is one
environment variable away from being wiped by a test run pointed at the wrong place. Fixing
it is a data migration, not a config edit — the collections stay behind in `test` when the
URI changes.

### Data residency

Atlas must stay pinned to `af-south-1` (Cape Town). The driver does not expose the region,
so this can only be confirmed in the Atlas UI. `config/db.js` never falling back to another
host is the code's half of that guarantee.
