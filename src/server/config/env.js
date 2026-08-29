import dotenv from 'dotenv';
import { z } from 'zod';

// Load .env once, here — every other module imports the validated `env` below
// instead of touching process.env directly.
dotenv.config();

const envSchema = z.object({
  // Server
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  // Where the SPA lives — used for CORS and for building links in outbound email.
  APP_URL: z.string().default('http://localhost:5173'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).optional(),

  // Database
  MONGO_URI: z.string().min(1, 'MONGO_URI is required'),

  // Auth — access tokens, refresh tokens, and the (separate) MFA-challenge secret.
  JWT_SECRET: z.string().min(1, 'JWT_SECRET is required'),
  // Separate secret so an MFA-challenge token can never be replayed as an access token,
  // even if one signing key is somehow exposed.
  JWT_CHALLENGE_SECRET: z.string().min(1, 'JWT_CHALLENGE_SECRET is required'),
  ACCESS_TOKEN_TTL: z.string().default('15m'), // jwt duration string, e.g. 15m
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(14),
  // Only applied to cookies in production — a domain on localhost makes the browser drop them.
  COOKIE_DOMAIN: z.string().optional(),

  /*
   * Shared secret for the scheduled-job endpoints (/api/v1/cron/*).
   *
   * Optional at boot so the app still starts without it, but the cron route fails CLOSED
   * when it is unset — an unset secret means "nobody may run these", never "everybody may".
   * These endpoints are public URLs, and one of them messages every beneficiary with an
   * expiring permit. Generate with: openssl rand -hex 32
   */
  CRON_SECRET: z.string().min(32, 'CRON_SECRET must be at least 32 characters').optional(),

  // Field-level encryption for permit numbers — 32 bytes, hex. Generate with:
  //   openssl rand -hex 32
  // Optional here so the server still boots without it, but utils/encrypt.js throws on
  // first use: a missing key must stop a write, never let a permit number through in the
  // clear. Rotating this value makes every stored permit number undecryptable.
  ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, 'ENCRYPTION_KEY must be 64 hex characters (openssl rand -hex 32)')
    .optional(),

  // Organisation identity, printed on every s18A tax receipt.
  //
  // SARS requires a s18A certificate to carry the PBO's approval number, the
  // organisation's name and address, and a certification that the donation will be used
  // exclusively for its objects. Without S18A_PBO_NUMBER no valid certificate can be
  // issued, so the receipt email falls back to a plain acknowledgement rather than
  // claiming to be something it is not.
  ORG_NAME: z.string().default('North West House of Refuge'),
  ORG_ADDRESS: z.string().default(''),
  S18A_PBO_NUMBER: z.string().trim().max(40).optional(),

  // Seed script. The ED email is the only account that must exist before anyone can log
  // in; SEED_ALLOW_PRODUCTION is an explicit opt-in because seeding prints an invite link.
  SEED_ED_EMAIL: z.email({ error: 'SEED_ED_EMAIL must be a valid email address' }).optional(),
  SEED_ED_NAME: z.string().optional(),
  SEED_ALLOW_PRODUCTION: z.coerce.boolean().default(false),

  // Security tuning
  BCRYPT_SALT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),
  MAX_LOGIN_ATTEMPTS: z.coerce.number().int().positive().default(5),
  LOCKOUT_MINUTES: z.coerce.number().int().positive().default(15),

  // Cloudinary
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),

  // Meta WhatsApp Cloud API.
  //
  // Unlike a URL-signed webhook, Meta signs only the raw request BODY, so nothing here
  // describes the public URL — see modules/whatsapp/whatsapp.routes.js.
  //
  // WHATSAPP_PHONE_NUMBER_ID is the id of the sending number in the WhatsApp Manager, not
  // the number itself. WHATSAPP_BUSINESS_NUMBER is the human-readable number, used only to
  // build the wa.me link on the public help guide.
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  // The app secret from the Meta app dashboard. This verifies X-Hub-Signature-256 and is
  // the ONLY authentication the inbound webhook has.
  WHATSAPP_APP_SECRET: z.string().optional(),
  // A string we choose; Meta echoes it back on the one-time GET verification handshake.
  WHATSAPP_VERIFY_TOKEN: z.string().optional(),
  WHATSAPP_BUSINESS_NUMBER: z.string().optional(),
  // Graph API version. Pinned rather than floating: Meta changes payload shapes between
  // versions, and an unannounced bump would break parsing in production.
  WHATSAPP_API_VERSION: z.string().default('v21.0'),

  // Paystack. The secret key does double duty: it authenticates outbound Graph calls AND
  // is the HMAC key that verifies inbound webhook signatures, so it is the one credential
  // that must never reach the browser — PAYSTACK_PUBLIC_KEY is the one the frontend gets.
  PAYSTACK_SECRET_KEY: z.string().optional(),
  PAYSTACK_PUBLIC_KEY: z.string().optional(),

  /*
   * PayPal. Three secrets and a mode flag, and the mode is the one that bites: PAYPAL_ENV
   * defaults to sandbox, so a deployment that forgets it takes no real money rather than
   * taking real money against test credentials. Only 'live' switches to the real API.
   *
   * PAYPAL_WEBHOOK_ID is not a secret in the usual sense — it identifies the webhook you
   * registered in PayPal's dashboard — but without it a notification cannot be verified at
   * all, and the handler refuses everything. Set it in the same change as the webhook URL.
   */
  PAYPAL_CLIENT_ID: z.string().optional(),
  PAYPAL_CLIENT_SECRET: z.string().optional(),
  PAYPAL_WEBHOOK_ID: z.string().optional(),
  PAYPAL_ENV: z.enum(['sandbox', 'live']).default('sandbox'),

  // Resend (email)
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default('NWHR <noreply@example.com>'),
  MAIL_REPLY_TO: z.string().optional(),

  // OpenAI — the WhatsApp bot's classifier.
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),

  /*
   * Gemini — the website help guide's classifier.
   *
   * Two providers on purpose, not by accident. The guide and the WhatsApp bot reach the same
   * `classify` contract and fall back the same way, so they can sit on different vendors
   * without either knowing; and an outage or a suspended key at one vendor then costs the
   * organisation one channel rather than both. The monthly ceiling below is shared and
   * counted across both, because it is the organisation's money that is capped, not a
   * vendor's.
   *
   * Flash-lite because the task is picking one label off a ten-item list. Verify the name
   * against Google's current model list before deploying — a name this API does not
   * recognise 404s, which this system reads as "no match" and answers with the menu, so it
   * would degrade quietly rather than fail loudly.
   */
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default('gemini-2.5-flash-lite'),

  // Hard monthly ceiling on model spend, in RANDS. Once the running total for the calendar
  // month reaches this, classification stops and the WhatsApp bot and help guide fall back
  // to their keyword and menu paths — which they already do on a timeout, so nothing
  // beneficiary-facing breaks. 0 disables the model entirely; there is deliberately no
  // "unlimited" value, because an uncapped metered API billed to a nonprofit is how a
  // runaway loop becomes a real invoice.
  OPENAI_MONTHLY_BUDGET_ZAR: z.coerce.number().min(0).default(300),
  // Used to price USD-denominated tokens in rands. A rough rate is fine: this guards a
  // budget, it does not settle an account, and being 5% out moves the cutoff by a few days
  // of ordinary traffic. Review it when the budget is reviewed.
  OPENAI_USD_ZAR_RATE: z.coerce.number().positive().default(18.5),
});

// `.env` uses REFRESH_TOKEN_TTL (bare number of days); map it onto the schema key so the
// intent ("14 days") is explicit in code. JWT_EXPIRES_IN is intentionally not read — it is
// superseded by ACCESS_TOKEN_TTL / REFRESH_TOKEN_TTL_DAYS.
// An unset variable in a .env file is written as `KEY=`, which arrives as an empty
// string, not as undefined. Without this, every commented-out optional — LOG_LEVEL,
// ENCRYPTION_KEY, MAIL_REPLY_TO — fails its own validator and the server refuses to boot
// on a freshly copied .env.example.
const source = Object.fromEntries(
  Object.entries({
    ...process.env,
    REFRESH_TOKEN_TTL_DAYS: process.env.REFRESH_TOKEN_TTL ?? process.env.REFRESH_TOKEN_TTL_DAYS,
  }).filter(([, value]) => value !== '')
);

const parsed = envSchema.safeParse(source);

if (!parsed.success) {
  const lines = parsed.error.issues.map((issue) => `   - ${issue.path.join('.')}: ${issue.message}`);

  /*
   * THROWS, IT DOES NOT EXIT. Under Express this was process.exit(1) and that was right:
   * one process, and a server with no database URI should refuse to open its port rather
   * than come up broken.
   *
   * Here the same call would take down a serverless instance — or a Next build worker —
   * for what is a configuration problem, and the platform would simply start another one
   * and repeat. Throwing surfaces the identical message, fails the build, and fails
   * requests loudly, without killing the runtime out from under everything else.
   */
  throw new Error(['Invalid environment configuration:', ...lines].join('\n'));
}

const env = parsed.data;

export default env;
