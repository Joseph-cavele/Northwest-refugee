# Tests

`npm test` runs what is ported. `vitest.config.ts` lists those files by name, so adding a
suite means adding it there — an excluded test is visible debt, a silently skipped one is not.

## Running now — 47 tests

| Suite | What it protects |
|---|---|
| `series.unit.test.ts` | The chart arithmetic: a STOCK is never summed across days, a FLOW is never compared against an unequal window, and a ratio against zero is undefined rather than "+100%". |
| `alerts.unit.test.ts` | That an alert cannot reach a role whose cards it never received, and that severity comes from the share rather than the count. |
| `reportDates.test.js` | SAST day boundaries, and that no metric is broken down by an axis that could identify a person. |
| `jobs.test.js` | The three scheduled jobs, every collaborator mocked. |

## Still to port — 23 route suites

The rest are the Express-era suite, preserved verbatim from `Backend/tests/` when that tree
was deleted. Every one is built on `supertest` against the Express `app` object, which no
longer exists:

```js
import app from '../src/app.js';          // gone
const res = await request(app).get(base); // gone with it
```

They are kept rather than deleted because they are the only written record of the
behaviours this system is not allowed to lose, and re-deriving them from the services
would be slower and less complete than adapting them.

## Porting the rest

A Route Handler is a function from `Request` to `Response`, so it can be called directly —
no HTTP server, no supertest:

```js
import { GET } from '@/app/api/v1/cases/route';

const res = await GET(
  new Request('http://test/api/v1/cases?limit=5', {
    headers: { authorization: `Bearer ${token}` },
  })
);
expect(res.status).toBe(200);
const { data } = await res.json();
```

`helpers.js` mostly survives — `makeUser`, `makeBeneficiary`, `expectSuccess` and
`expectError` are about fixtures and the response envelope, neither of which changed. The
`app` import and the `request(app)` calls are what need replacing.

Route params arrive as the second argument and are a **promise**:

```js
await GET(request, { params: Promise.resolve({ id }) });
```

## Do these first

Ordered by what they protect, not by how easy they are:

1. **`finance.routes.test.js`** — self-approval rejection, the approval ceiling, budget
   overspend, and the immutability of a posted transaction.
2. **`beneficiary.routes.test.js`** — that reading a permit number or a vulnerability flag
   writes a `SENSITIVE_READ` audit row, and that a minor cannot be registered without a
   guardian.
3. **`payment.routes.test.js`** — webhook signature verification and settlement
   idempotency. A replayed notification must not count the money twice.
4. **`whatsapp.routes.test.js`** — that declining consent leaves nothing persisted.
5. **`auth.routes.test.js`** — refresh-token rotation and reuse detection.

## The database these use

`setup.js` points at `mongodb://127.0.0.1:27017/nwhr-test` and `resetDatabase()` **empties
every collection**. Never point `TEST_MONGO_URI` at Atlas — the production data currently
lives in a database called `test`, which is one careless environment variable away from
exactly this.
