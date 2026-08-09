import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import crypto from 'node:crypto';
import { app, request, connect, disconnect, resetDatabase } from './helpers.js';
import WhatsAppSession from '../src/modules/whatsapp/session.model.js';
import Beneficiary from '../src/modules/beneficiaries/beneficiary.model.js';
import { handleMessage } from '../src/modules/whatsapp/bot.service.js';
import { TRANSLATED } from '../src/modules/whatsapp/prompts.js';

const hasDb = await connect();
const FROM = '+27821234567';

// The state machine is driven directly. handleMessage is deliberately separate from the
// webhook and from Meta, so the flow can be walked without either.
describe.runIf(hasDb)('whatsapp intake flow', () => {
  beforeEach(async () => {
    await resetDatabase();
    await WhatsAppSession.syncIndexes();
  });
  afterAll(disconnect);

  const say = (body, extra = {}) =>
    handleMessage({ from: FROM, body, messageId: `wamid.${Math.random().toString(36).slice(2)}`, ...extra });

  const session = () => WhatsAppSession.findOne({ from: FROM });

  /** Walk to just after consent, which is where personal data starts. */
  const throughConsent = async () => {
    await say('hi');
    await say('1'); // language
    await say('1'); // consent: yes
  };

  const fullIntake = async () => {
    await throughConsent();
    await say('Amina');
    await say('Mwangi');
    await say('1'); // female
    await say('1994-03-21');
    await say('Democratic Republic of the Congo');
    await say('6'); // no documents — permit questions are skipped
    await say('2'); // food
    return say('1'); // confirm
  };

  // --- consent ---------------------------------------------------------------
  it('asks for consent before collecting anything about the person', async () => {
    await say('hello');
    const greeted = await session();
    expect(greeted.state).toBe('ASK_LANGUAGE');
    // Only the number they messaged from — nothing else exists yet.
    expect(greeted.draft).toEqual({});

    await say('1');
    expect((await session()).state).toBe('ASK_CONSENT');
  });

  it('explains what is collected and that refusing is allowed', async () => {
    await say('hi');
    const consentText = await say('1');
    expect(consentText).toMatch(/permission/i);
    expect(consentText).toMatch(/nothing is saved/i);
    expect(consentText).toMatch(/stop using it/i);
  });

  it('DECLINING CONSENT DELETES THE SESSION WITH NOTHING PERSISTED', async () => {
    await say('hi');
    await say('1');
    const reply = await say('2'); // no

    expect(reply).toMatch(/nothing has been saved/i);
    // Not flagged, not soft-deleted — gone.
    expect(await WhatsAppSession.countDocuments({})).toBe(0);
    expect(await Beneficiary.countDocuments({})).toBe(0);
  });

  it('asks again rather than guessing at an unclear consent answer', async () => {
    await say('hi');
    await say('1');
    const reply = await say('maybe later');
    // Reading "no" as "yes" would register someone who refused.
    expect(reply).toMatch(/did not understand|1 to 2/i);
    expect((await session()).state).toBe('ASK_CONSENT');
    expect((await session()).consent.given).toBeNull();
  });

  // --- nothing is a record until CONFIRM -------------------------------------
  it('creates no beneficiary until the person confirms', async () => {
    await throughConsent();
    await say('Amina');
    await say('Mwangi');
    await say('1');
    await say('1994-03-21');
    await say('Democratic Republic of the Congo');
    await say('6');
    await say('2');

    expect((await session()).state).toBe('CONFIRM');
    // Every answer is on the session, and nowhere else.
    expect(await Beneficiary.countDocuments({})).toBe(0);
  });

  it('creates the beneficiary on confirmation and returns a reference', async () => {
    const reply = await fullIntake();

    expect(await Beneficiary.countDocuments({})).toBe(1);
    const created = await Beneficiary.findOne({});
    expect(created.firstName).toBe('Amina');
    expect(created.intakeChannel).toBe('WHATSAPP');
    expect(created.consent.method).toBe('WHATSAPP');
    expect(created.contact.cellphone).toBe(FROM);
    expect(reply).toContain(created.referenceCode);
  });

  it('discards everything and starts over when the summary is rejected', async () => {
    await throughConsent();
    await say('Amina');
    await say('Mwangi');
    await say('1');
    await say('1994-03-21');
    await say('DRC');
    await say('6');
    await say('2');

    await say('2'); // "no, start again"
    const s = await session();
    expect(s.state).toBe('ASK_NAME');
    expect(s.draft).toEqual({});
    expect(await Beneficiary.countDocuments({})).toBe(0);
  });

  // --- control words ---------------------------------------------------------
  it('CANCEL deletes the conversation at any point', async () => {
    await throughConsent();
    await say('Amina');

    const reply = await say('cancel');
    expect(reply).toMatch(/nothing was saved/i);
    expect(await WhatsAppSession.countDocuments({})).toBe(0);
    expect(await Beneficiary.countDocuments({})).toBe(0);
  });

  it('RESTART clears the draft and the consent answer', async () => {
    await throughConsent();
    await say('Amina');

    await say('restart');
    const s = await session();
    expect(s.state).toBe('ASK_LANGUAGE');
    expect(s.draft).toEqual({});
    // Consent must be asked again, not inherited.
    expect(s.consent.given).toBeNull();
  });

  // --- skipping the permit questions -----------------------------------------
  it('does not ask an undocumented person for a permit number', async () => {
    await throughConsent();
    await say('Amina');
    await say('Mwangi');
    await say('1');
    await say('1994-03-21');
    await say('DRC');
    const afterStatus = await say('6'); // no documents

    // Straight to the service question.
    expect((await session()).state).toBe('ASK_SERVICE');
    expect(afterStatus).toMatch(/help with most/i);
  });

  it('asks an asylum seeker for their permit, and accepts SKIP', async () => {
    await throughConsent();
    await say('Amina');
    await say('Mwangi');
    await say('1');
    await say('1994-03-21');
    await say('DRC');
    const afterStatus = await say('1'); // asylum seeker
    expect(afterStatus).toMatch(/permit number/i);

    await say('skip');
    // No number means no upload question either.
    expect((await session()).state).toBe('ASK_SERVICE');
  });

  it('stores a permit number encrypted once the record is created', async () => {
    await throughConsent();
    await say('Amina');
    await say('Mwangi');
    await say('1');
    await say('1994-03-21');
    await say('DRC');
    await say('1'); // asylum seeker
    await say('ASY-2026-445566');
    await say('skip'); // no photo
    await say('2'); // food
    await say('1'); // confirm

    const raw = await Beneficiary.collection.findOne({});
    expect(raw.immigration.permitNumber.startsWith('v1:')).toBe(true);
    expect(JSON.stringify(raw)).not.toContain('445566');
  });

  // --- validation ------------------------------------------------------------
  it('rejects an unreadable or future date of birth', async () => {
    await throughConsent();
    await say('Amina');
    await say('Mwangi');
    await say('1');

    expect(await say('21 March 1994')).toMatch(/YYYY-MM-DD/);
    expect(await say('2999-01-01')).toMatch(/YYYY-MM-DD/);
    expect((await session()).state).toBe('ASK_DOB');
  });

  it('hands a minor to a caseworker instead of registering them', async () => {
    await throughConsent();
    await say('Thabo');
    await say('Mokoena');
    await say('2'); // male
    await say('2014-01-01'); // a child
    await say('Zimbabwe');
    await say('6');
    await say('2');
    const reply = await say('1'); // confirm

    // The model refuses a minor without a guardian, and the bot cannot establish one.
    expect(reply).toMatch(/under 18/i);
    expect(reply).toMatch(/guardian/i);
    expect(await Beneficiary.countDocuments({})).toBe(0);
  });

  // --- safety ----------------------------------------------------------------
  it('gives emergency numbers at any point without losing the place', async () => {
    await throughConsent();
    await say('Amina');

    const reply = await say('my husband beat me last night');
    expect(reply).toContain('10111');
    expect(reply).toContain('0800 428 428');
    // The conversation carries on from where it was.
    expect((await session()).state).toBe('ASK_SURNAME');
  });

  // --- resilience ------------------------------------------------------------
  it('ignores a redelivered message rather than advancing twice', async () => {
    await say('hi');
    const id = 'wamid.duplicate';
    await handleMessage({ from: FROM, body: '1', messageId: id });
    const after = (await session()).state;

    // Meta retries on any non-200.
    await handleMessage({ from: FROM, body: '1', messageId: id });
    expect((await session()).state).toBe(after);
  });

  it('gives the session an expiry so an abandoned intake is swept', async () => {
    await say('hi');
    const s = await session();
    expect(s.expiresAt.getTime()).toBeGreaterThan(Date.now());
    // Half-finished answers about a person must not sit in the database indefinitely.
    expect(s.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(24 * 3600 * 1000 + 1000);
  });

  it('never serialises the draft out of the bot', async () => {
    await throughConsent();
    await say('Amina');
    const s = await session();
    expect(s.toJSON().draft).toBeUndefined();
  });

  it('tells someone already registered their reference instead of starting again', async () => {
    await fullIntake();
    const reply = await say('hello again');
    expect(reply).toMatch(/already registered/i);
    expect(await Beneficiary.countDocuments({})).toBe(1);
  });

  it('only offers languages it can actually speak', async () => {
    const reply = await say('hi');
    expect(TRANSLATED).toEqual(['en']);
    expect(reply).toContain('English');
    // Inviting someone into French and then replying in English is worse than not asking.
    expect(reply).not.toContain('Français');
  });
});

// --- the webhook ------------------------------------------------------------------
describe('whatsapp webhook', () => {
  const url = '/api/v1/whatsapp/webhook';
  const SECRET = process.env.WHATSAPP_APP_SECRET;

  /** Sign exactly as Meta does: HMAC-SHA256 over the raw body, keyed by the app secret. */
  const sign = (raw) =>
    'sha256=' + crypto.createHmac('sha256', SECRET).update(raw).digest('hex');

  const inbound = (text, id = 'wamid.test1') => ({
    object: 'whatsapp_business_account',
    entry: [
      {
        changes: [
          {
            value: {
              messaging_product: 'whatsapp',
              messages: [{ from: '27829990000', id, type: 'text', text: { body: text } }],
            },
          },
        ],
      },
    ],
  });

  const post = (payload, signature) => {
    const raw = JSON.stringify(payload);
    const req = request(app).post(url).set('Content-Type', 'application/json');
    if (signature !== undefined) req.set('x-hub-signature-256', signature);
    return req.send(raw);
  };

  it('refuses an unsigned request', async () => {
    // The signature is the only authentication this endpoint has.
    expect((await post(inbound('hi'))).status).toBe(403);
  });

  it('refuses a forged signature', async () => {
    expect((await post(inbound('hi'), 'sha256=deadbeef')).status).toBe(403);
  });

  it('refuses a signature computed over different bytes', async () => {
    // A genuine digest for a DIFFERENT payload — replaying one body's signature onto
    // another must not pass.
    const other = sign(JSON.stringify(inbound('something else')));
    expect((await post(inbound('hi'), other)).status).toBe(403);
  });

  it('says nothing about why it refused', async () => {
    const res = await post(inbound('hi'));
    expect(res.text).not.toMatch(/signature|secret|token/i);
  });

  it('accepts a correctly signed request and answers Meta immediately', async () => {
    const raw = JSON.stringify(inbound('hi', 'wamid.accepted'));
    const res = await request(app)
      .post(url)
      .set('Content-Type', 'application/json')
      .set('x-hub-signature-256', sign(raw))
      .send(raw);

    // 200 before processing: a slow classification must not cause a Meta timeout and a
    // duplicate delivery. The reply goes out over the Graph API once the work is done.
    expect(res.status).toBe(200);
  });

  // --- the verification handshake ---------------------------------------------------

  it('echoes the challenge back as plain text when the verify token matches', async () => {
    const res = await request(app).get(url).query({
      'hub.mode': 'subscribe',
      'hub.verify_token': process.env.WHATSAPP_VERIFY_TOKEN,
      'hub.challenge': '1158201444',
    });

    expect(res.status).toBe(200);
    // Plain text, not JSON — Meta compares the body byte for byte.
    expect(res.text).toBe('1158201444');
  });

  it('refuses the handshake when the verify token is wrong', async () => {
    const res = await request(app).get(url).query({
      'hub.mode': 'subscribe',
      'hub.verify_token': 'not-the-token',
      'hub.challenge': '1158201444',
    });
    expect(res.status).toBe(403);
  });
});
