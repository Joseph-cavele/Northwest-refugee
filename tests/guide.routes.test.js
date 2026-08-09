import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import env from '../src/config/env.js';
import { LANGUAGES } from '../src/config/constants.js';
import { GUIDE, ROOT_NODE_ID } from '../src/modules/guide/guide.content.js';

const base = '/api/v1/guide';

// No database and no login: the guide is static content, which is the whole point of the
// design. These run whether or not a mongod is up.
describe('guide routes', () => {
  const expectSuccess = (res, status = 200) => {
    expect(res.status).toBe(status);
    expect(res.body.success).toBe(true);
    return res.body.data;
  };

  it('is reachable without authentication', async () => {
    // Someone looking for help must not need an account to find out how to get it.
    const data = expectSuccess(await request(app).get(base));
    expect(data.rootId).toBe(ROOT_NODE_ID);
  });

  it('returns the whole tree in one request', async () => {
    const data = expectSuccess(await request(app).get(base));
    expect(Object.keys(data.nodes).length).toBeGreaterThan(10);
    expect(data.nodes[ROOT_NODE_ID].options.length).toBeGreaterThan(0);
  });

  it('serves one step at a time', async () => {
    const data = expectSuccess(await request(app).get(`${base}/steps/need-help`));
    expect(data.node.id).toBe('need-help');
    expect(data.node.back).toBe('root');
  });

  it('every option and back-link points at a step that exists', async () => {
    const data = expectSuccess(await request(app).get(base));
    const ids = new Set(Object.keys(data.nodes));

    for (const node of Object.values(data.nodes)) {
      for (const option of node.options ?? []) {
        // A dead end in a help guide leaves someone stuck with no way forward.
        expect(ids, `${node.id} → ${option.next}`).toContain(option.next);
      }
      if (node.back) expect(ids, `${node.id} back → ${node.back}`).toContain(node.back);
    }
  });

  it('every step is reachable from the root', async () => {
    const data = expectSuccess(await request(app).get(base));

    const seen = new Set();
    const queue = [data.rootId];
    while (queue.length) {
      const id = queue.shift();
      if (seen.has(id)) continue;
      seen.add(id);
      for (const o of data.nodes[id].options ?? []) queue.push(o.next);
    }

    const orphans = Object.keys(data.nodes).filter((id) => !seen.has(id));
    expect(orphans, `unreachable steps: ${orphans.join(', ')}`).toHaveLength(0);
  });

  it('reports honestly when a language has not been translated', async () => {
    const en = expectSuccess(await request(app).get(`${base}?lang=en`));
    expect(en.translated).toBe(true);

    const fr = expectSuccess(await request(app).get(`${base}?lang=fr`));
    // Serving English under a French label reads as a broken site to someone who cannot
    // read it — so it says so rather than pretending.
    expect(fr.requestedLanguage).toBe('fr');
    expect(fr.language).toBe('en');
    expect(fr.translated).toBe(false);
  });

  it('advertises which languages exist and which are written', async () => {
    const data = expectSuccess(await request(app).get(base));
    expect(data.availableLanguages).toEqual(LANGUAGES);
    expect(data.translatedLanguages).toEqual(['en']);
  });

  it('rejects a language it does not know', async () => {
    const res = await request(app).get(`${base}?lang=zz`);
    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
  });

  it('404s an unknown step and rejects a malformed one', async () => {
    expect((await request(app).get(`${base}/steps/does-not-exist`)).status).toBe(404);
    expect((await request(app).get(`${base}/steps/..%2F..%2Fetc`)).status).toBe(422);
  });

  it('surfaces emergency numbers on the safety step, not organisation numbers', async () => {
    const data = expectSuccess(await request(app).get(`${base}/steps/help-safety`));
    expect(data.node.urgent).toBe(true);

    const numbers = data.node.actions.filter((a) => a.type === 'phone').map((a) => a.value);
    // These have to work at 2am, which NWHR's office line will not.
    expect(numbers).toContain('10111');
    expect(numbers).toContain('0800428428');
  });

  it('renders the WhatsApp action as a wa.me link when a number is configured', async () => {
    // tests/setup.js configures WHATSAPP_BUSINESS_NUMBER for the whole suite.
    const data = expectSuccess(await request(app).get(`${base}/steps/contact`));
    const whatsapp = data.node.actions.find((a) => a.type === 'whatsapp');
    expect(whatsapp.value).toMatch(/^https:\/\/wa\.me\/\d+$/);
  });

  it('drops the WhatsApp action rather than rendering a dead button', async () => {
    // The condition has to be created, not assumed: setup.js sets a number for every
    // suite, so asserting on the ambient environment tested nothing.
    const configured = env.WHATSAPP_BUSINESS_NUMBER;
    env.WHATSAPP_BUSINESS_NUMBER = undefined;
    try {
      const data = expectSuccess(await request(app).get(`${base}/steps/contact`));
      expect(data.node.actions.some((a) => a.type === 'whatsapp')).toBe(false);
    } finally {
      env.WHATSAPP_BUSINESS_NUMBER = configured;
    }
  });

  it('tells people what will be asked, and that they can refuse', async () => {
    const data = expectSuccess(await request(app).get(`${base}/steps/what-we-ask`));
    // Consent before data, stated to the person before they start.
    expect(data.node.note).toMatch(/encrypted/i);
    expect(data.node.note).toMatch(/stop using your information/i);
  });

  it('is cacheable, since content only changes on deploy', async () => {
    const res = await request(app).get(base);
    expect(res.headers['cache-control']).toMatch(/max-age=300/);
  });

  it('never claims to give immigration decisions', async () => {
    const data = expectSuccess(await request(app).get(`${base}/steps/help-documents`));
    // The one thing the guide must not imply it can do.
    expect(data.node.message).toMatch(/cannot decide your application/i);
  });

  it('content has no empty screens', async () => {
    for (const node of Object.values(GUIDE.en)) {
      expect(node.title, node.id).toBeTruthy();
      expect(node.message, node.id).toBeTruthy();
      // Every screen must offer a way onward, or it is a dead end.
      const hasWayOut = (node.options?.length ?? 0) > 0 || (node.actions?.length ?? 0) > 0 || Boolean(node.back);
      expect(hasWayOut, `${node.id} has no way forward`).toBe(true);
    }
  });
});

describe('guide free-text matching', () => {
  const expectData = (res, status = 200) => {
    expect(res.status).toBe(status);
    expect(res.body.success).toBe(true);
    return res.body.data;
  };

  // No OPENAI_API_KEY in tests, so the model is never called. These cover the safety
  // rules and the fallback, which are the parts that must hold when it is unavailable.

  it('validates the input', async () => {
    expect((await request(app).post(`${base}/ask`).send({})).status).toBe(422);
    expect((await request(app).post(`${base}/ask`).send({ text: '   ' })).status).toBe(422);
    expect((await request(app).post(`${base}/ask`).send({ text: 'x'.repeat(500) })).status).toBe(422);
  });

  it('falls back to the menu when the model is unavailable', async () => {
    const data = expectData(await request(app).post(`${base}/ask`).send({ text: 'I need groceries' }));
    // A wrong guess is worse than asking.
    expect(data.matched).toBe(false);
    expect(data.source).toBe('fallback');
    expect(data.node.id).toBe('need-help');
    expect(data.requiresConfirmation).toBe(false);
  });

  it('routes danger straight to the safety screen without asking a model', async () => {
    for (const text of [
      'my husband beat me last night',
      'I am not safe here',
      'someone threatened to kill me',
      'my child was assaulted',
    ]) {
      const data = expectData(await request(app).post(`${base}/ask`).send({ text }));
      // An outage must never stand between a person and an emergency number.
      expect(data.source, text).toBe('safety-rule');
      expect(data.node.id, text).toBe('help-safety');
      // And they should not have to confirm "did you mean" first.
      expect(data.requiresConfirmation, text).toBe(false);
      expect(data.node.actions.some((a) => a.value === '10111')).toBe(true);
    }
  });

  it('does not treat ordinary requests as emergencies', async () => {
    const data = expectData(await request(app).post(`${base}/ask`).send({ text: 'how do I renew my permit' }));
    expect(data.node.id).not.toBe('help-safety');
  });

  it('never returns text that was not written by the organisation', async () => {
    const data = expectData(await request(app).post(`${base}/ask`).send({ text: 'anything at all' }));
    const written = Object.values(GUIDE.en).map((n) => n.message);
    // Everything a visitor reads comes from guide.content.js.
    expect(written).toContain(data.node.message);
  });

  it('does not echo the visitor back to themselves', async () => {
    const secret = 'my permit number is 9202204720082';
    const res = await request(app).post(`${base}/ask`).send({ text: secret });
    expect(JSON.stringify(res.body)).not.toContain('9202204720082');
  });

  it('is not cached, unlike the static screens', async () => {
    const res = await request(app).post(`${base}/ask`).send({ text: 'hello' });
    expect(res.headers['cache-control']).toMatch(/no-store/);
  });

  it('only routes to screens that are safe to land on directly', async () => {
    const { ROUTABLE_STEPS } = await import('../src/modules/guide/guide.intent.js');
    const ids = new Set(Object.keys(GUIDE.en));
    for (const step of ROUTABLE_STEPS) expect(ids).toContain(step);
    // Registration is reached by choosing it, not by being dropped there.
    expect(ROUTABLE_STEPS).not.toContain('register');
    expect(ROUTABLE_STEPS).not.toContain('what-we-ask');
  });
});
