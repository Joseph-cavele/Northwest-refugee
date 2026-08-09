# CLAUDE.md — NWHR Backend

Guidance for Claude Code (and any AI agent) working in this repository.

## What this is

The API for **North West House of Refuge (NWHR)**, a nonprofit in Rustenburg,
North West Province, South Africa, serving refugees, asylum seekers and
migrants. Mission: *Empowering. Integrating. Transforming Lives.*

The system handles beneficiary intake (including a WhatsApp self-registration
bot), the five programme pillars, case management and referrals, financial
controls, and fundraising with South African payment gateways.

**This system holds special personal information about vulnerable people.**
Permit numbers, immigration status and vulnerability flags belong to people
whose safety can depend on that data staying private. Treat every change that
touches beneficiary data, encryption, audit logging or access control as
high-stakes. When in doubt, ask rather than assume.

## Stack

- Node.js ≥ 20, **ES modules only** (`"type": "module"` — use `import`, never `require`)
- **Plain JavaScript, not TypeScript.** Do not introduce `.ts` files or add a build step.
- Express 4 · Mongoose 8 · MongoDB Atlas (`af-south-1` / Cape Town for data residency)
- zod for all input validation
- JWT auth (access + rotating refresh) with permission-based RBAC
- Cloudinary (authenticated delivery), Resend (email), Meta WhatsApp Cloud API, OpenAI (intent classification only)
- Paystack for donations (the only gateway — PayFast and Ozow were removed)
- pino for logging, node-cron for scheduled jobs

## Commands

```bash
npm run dev      # nodemon src/server.js (config in nodemon.json)
npm start        # production
npm run seed     # seed ED user + five pillar programmes
npm test         # vitest
npm run lint     # eslint
```

Copy `.env.example` to `.env` first. `src/config/env.js` validates every
variable with zod and exits with a readable message if anything is missing —
if the server won't boot, read that message before debugging anything else.

**Do not add `"signal": "SIGTERM"` to `nodemon.json`.** It looks like it would
give the restart a graceful shutdown via the handlers in `server.js`, and on
Linux it would. On Windows SIGTERM is not a real signal: the kill silently
fails, the old process keeps port 5000, and the replacement dies on EADDRINUSE
— so saving a file quietly stops reloading. Restarts are abrupt in dev on every
platform, which is what `node --watch` did too; graceful shutdown is for
SIGTERM from the orchestrator in production, where it matters.

Generate the encryption key with `openssl rand -hex 32`.

## Architecture

Modular monolith. Strict layering, enforced by convention:

```
route → middleware (auth, authorize, validate) → controller → service → model
```

- **Controllers never import Mongoose models.** They call services and shape the HTTP response. Nothing else.
- **Services hold all business logic** and are the only layer that touches models.
- **Routes declare permissions**, never role names: `authorize('transaction:approve')`.
- Cross-module access goes service → service, never service → another module's model, except for the read-only lookups already present.

```
src/
├── config/          env, logger, db, cloudinary, constants, permissions
├── middleware/      authenticate, authorize, validate, errorHandler, rateLimiter, upload
├── utils/           AppError, catchAsync, apiResponse, paginate, encrypt, tokens, money, dates, phone
├── modules/<name>/  <name>.model.js · .schema.js · .service.js · .controller.js · .routes.js
├── jobs/            cron jobs (permit expiry, daily rollup, finance alerts)
├── app.js           express assembly + route mounting
└── server.js        boot, graceful shutdown
```

New module? Follow the five-file pattern exactly. Mount it in `app.js` under `/api/v1`.

## Non-negotiable invariants

Break any of these and the system stops being trustworthy to an auditor, a
donor, or a beneficiary.

### Money
- **Stored as integer cents. Never floats.** zod schemas accept rands from the client; services convert with `toCents()` immediately. Only `formatZAR()` / `toRands()` on the way out.
- `Transaction` amounts are always positive. Direction is expressed by `type`, not by sign.

### Financial controls
- **The creator can never approve their own transaction or budget.** Enforced in `finance.service.js`, not only in the role table. Do not remove that check to "simplify" a flow.
- Amounts above the approver's ceiling (`APPROVAL_CEILINGS`) escalate to the Executive Director.
- **Posted transactions are immutable.** A pre-save hook blocks edits. Corrections happen via `reverseTransaction()`, which writes a matching `REVERSAL` entry. Never edit or delete a posted row.
- Expenses commit against a budget line at creation and move `committed → spent` on approval. Rejections release the commitment.
- A custodian cannot reconcile their own petty cash float.

### POPIA / privacy
- Permit numbers are encrypted at rest (AES-256-GCM) with an HMAC **blind index** for lookup. Never store a permit number in plaintext, never log one.
- `vulnerabilityFlags` and `immigration.permitNumber` are `select: false`. They only load behind the `beneficiary:read_sensitive` permission, and **reading them writes an audit entry** (`recordSensitiveRead`). Do not bypass this to make a query convenient.
- Consent is captured **before** any personal data is stored. In the WhatsApp bot, declining consent deletes the session with nothing persisted — keep it that way.
- A beneficiary under 18 cannot be registered without a recorded guardian.
- Beneficiary documents are private: signed, time-limited Cloudinary URLs only. Never make a permit scan publicly addressable.
- `logger.js` has a redact list. Add to it when you add a field that carries personal information.

### Audit
- `AuditLog` is **append-only** — every update and delete hook is blocked at the model level. Do not "fix" that.
- Audit writes are best-effort and must never break the request they record.
- Every state change on money, consent, verification, documents and user accounts gets an audit entry.

### Webhooks
- Mounted in `app.js` **before** the global JSON parser, because signatures are computed over raw bytes. Do not reorder that.
- **Paystack** passes four gates before money counts: signature (HMAC-**SHA512** over the raw body — not SHA256) → known reference → server-to-server `verifyTransaction` → amount and currency match. A valid signature proves who sent the message, never that its contents are true.
- **WhatsApp (Meta)** verifies `X-Hub-Signature-256`, an HMAC-**SHA256** over the raw body keyed by the app secret. The `GET /webhook` handshake must echo `hub.challenge` back as **plain text** — a JSON envelope fails verification with only a generic dashboard error.
- Both signature checks compare in constant time and fail closed when the secret is unset.
- `settleDonation()` is **idempotent** — gateways retry, and a replay must not double-count.
- Webhooks reply `200` immediately, then process. A non-200 triggers retries.
- Meta delivers messages *and* delivery receipts through the same hook; only `messages` entries are conversation.

### AI usage
- OpenAI is used **only** to map a free-text reply onto a fixed option list (`intent.service.js`). It never invents field values, and every classified answer is echoed back for confirmation. Do not expand its role into generating advice, decisions or beneficiary-facing content without discussing it first.

## Conventions

**Errors** — throw `AppError` (use the static factories: `AppError.notFound('Beneficiary')`, `AppError.selfApproval()`). Never `res.status(500).json(...)` inside a service. Wrap async handlers in `catchAsync`.

**Responses** — `sendSuccess` / `sendCreated` / `sendNoContent` from `utils/apiResponse.js`. Envelope is `{ success, data, meta }`; errors are `{ success: false, error: { code, message, details }, requestId }`.

**Validation** — every route with a body, params or query gets `validate({ body, params, query })`. Validated query lands on `req.validatedQuery`, not `req.query`.

**Permissions** — add new ones to `config/permissions.js`, which is the single source of truth. Programme-scoped roles (coordinator, peer leader, volunteer) are narrowed with `scopeToProgrammes()` / `assertProgrammeAccess()`.

**Pagination** — `paginateQuery(Model, filter, query)`. Limits are capped so nobody can dump the beneficiary register with `?limit=100000`.

**Transactions** — use `withTransaction()` from `config/db.js` for multi-document writes. It falls back gracefully on a standalone mongod.

**Route order** — static paths before `/:id` (e.g. `/permits/expiring` must be declared before `/:id`).

**Language** — the codebase uses South African English (*enrolment*, *organisation*, *programme*) in user-facing copy. Beneficiary-facing strings live in `whatsapp/prompts.js`, keyed by language (en, fr, sw, pt). Never hard-code English in the bot's state machine.

**Comments** — explain *why*, not *what*. The existing comments flag non-obvious constraints; match that register rather than narrating the code.

## Roles

`EXECUTIVE_DIRECTOR`, `ADMIN_OFFICER`, `PROJECT_COORDINATOR`, `FINANCE_OFFICER`,
`COMMS_OFFICER`, `ME_OFFICER`, `PEER_LEADER`, `VOLUNTEER`.

Volunteers and peer leaders only see beneficiary records they captured
themselves. Coordinators are scoped to their assigned programmes.

## Programme pillars

`ADVOCACY_DOCUMENTATION` · `SKILLS_ENTREPRENEURSHIP` · `EDUCATION` ·
`SOCIAL_COHESION` · `WOMEN_YOUTH_EMPOWERMENT`

## WhatsApp intake flow

`GREETING → ASK_LANGUAGE → ASK_CONSENT → ASK_NAME → ASK_SURNAME → ASK_GENDER →
ASK_DOB → ASK_NATIONALITY → ASK_IMMIGRATION_STATUS → ASK_PERMIT_NUMBER →
ASK_PERMIT_UPLOAD → ASK_SERVICE → CONFIRM → DONE`

Nothing becomes a permanent record until `finalise()` at the CONFIRM step.
Sessions carry a TTL so abandoned intakes expire instead of becoming half-
records. `RESTART` / `CANCEL` resets at any point.

## Testing

vitest + supertest. When adding tests, prioritise the invariants above:
self-approval rejection, budget overspend rejection, webhook idempotency,
sensitive-read auditing, consent-declined leaving no trace. Those are the
behaviours worth protecting with a regression test.

## Deployment notes

- Atlas must stay pinned to `af-south-1` for data residency.
- `trust proxy` is set to 1 — correct for a single reverse proxy (Render, Nginx). Adjust if the topology changes, or rate limiting by IP breaks.
- Cron jobs run in `Africa/Johannesburg` and start with the server. On multiple instances they will double-fire; move to a single worker or a distributed lock before scaling horizontally.