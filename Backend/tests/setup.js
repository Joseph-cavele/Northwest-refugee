// Loaded before every test file. Pins the environment so a suite can never reach a real
// database, a real payment gateway, or a real mail provider.

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';

// A fixed key so encrypted fixtures are stable across runs; test data only.
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY ?? 'a'.repeat(64);
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-jwt-secret';
process.env.JWT_CHALLENGE_SECRET = process.env.JWT_CHALLENGE_SECRET ?? 'test-challenge-secret';

// Empty rather than absent: config/env.js filters empty strings, so the services take
// their offline paths (email logs the link, Cloudinary refuses) instead of calling out.
process.env.RESEND_API_KEY = '';
process.env.CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME ?? '';

// OpenAI is METERED — a suite that reaches it spends real money, and does so every time
// anyone runs `npm test`. Cleared unconditionally (not `?? ''`) so a key sitting in a
// developer's .env cannot opt the whole suite into billing without anyone noticing. The
// classifier's own contract is that a missing key means "return null", which is the same
// path a timeout takes, so every caller's fallback is what gets exercised here — which is
// the behaviour worth testing anyway.
process.env.OPENAI_API_KEY = '';

// The minimum the env schema allows. Real cost factors make a suite that logs in dozens
// of times take minutes, and the hashing itself is not what these tests are checking.
process.env.BCRYPT_SALT_ROUNDS = '10';

// Fake WhatsApp Cloud API credentials, so webhook signature verification is actually
// exercised. No real values are wanted: outbound sends fail against these and are
// swallowed, which is the behaviour a missing token should have anyway.
process.env.WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID ?? '100000000000000';
process.env.WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN ?? 'test-whatsapp-token';
process.env.WHATSAPP_APP_SECRET = process.env.WHATSAPP_APP_SECRET ?? 'test-whatsapp-app-secret';
process.env.WHATSAPP_VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN ?? 'test-verify-token';
process.env.WHATSAPP_BUSINESS_NUMBER = process.env.WHATSAPP_BUSINESS_NUMBER ?? '+27820000000';

// Likewise Paystack: a fake secret still exercises the HMAC path, and no test may reach
// the live API. The verify call is stubbed per-test where the flow needs it.
process.env.PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY ?? 'sk_test_0000000000000000';
process.env.PAYSTACK_PUBLIC_KEY = process.env.PAYSTACK_PUBLIC_KEY ?? 'pk_test_0000000000000000';

// Never the development database. TEST_MONGO_URI lets CI point somewhere else.
process.env.MONGO_URI =
  process.env.TEST_MONGO_URI ?? 'mongodb://127.0.0.1:27017/nwhr-test';
