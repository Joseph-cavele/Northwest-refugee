import logger from '../../config/logger.js';
import { normalisePhone } from '../../utils/phone.js';
import { isMinor } from '../../utils/dates.js';
import * as audit from '../audit/audit.service.js';
import { ACTIONS } from '../audit/audit.model.js';
import { createBeneficiary } from '../beneficiaries/beneficiary.service.js';
import Beneficiary from '../beneficiaries/beneficiary.model.js';
import WhatsAppSession, { SESSION_TTL_HOURS } from './session.model.js';
import { sendMessage } from './whatsapp.client.js';
import {
  prompt, summarise, TRANSLATED, FALLBACK_LANGUAGE, CONTROL_WORDS,
  GENDER_OPTIONS, IMMIGRATION_OPTIONS, SERVICE_OPTIONS, NO_PERMIT_STATUSES,
} from './prompts.js';
import {
  matchOption, matchYesNo, looksUrgent,
  GENDER_KEYWORDS, IMMIGRATION_KEYWORDS, SERVICE_KEYWORDS,
} from './intent.service.js';

// The intake state machine.
//
//   GREETING → ASK_LANGUAGE → ASK_CONSENT → ASK_NAME → ASK_SURNAME → ASK_GENDER
//   → ASK_DOB → ASK_NATIONALITY → ASK_IMMIGRATION_STATUS → ASK_PERMIT_NUMBER
//   → ASK_PERMIT_UPLOAD → ASK_SERVICE → CONFIRM → DONE
//
// NOTHING BECOMES A RECORD UNTIL finalise() AT CONFIRM. Everything before that lives on a
// session with a TTL, so an abandoned conversation expires instead of leaving a
// half-person in the register. Declining consent deletes the session outright.
//
// The bot is registered as a system actor: it has no User row, so audit entries record a
// null actor with the channel in `meta`.

const BOT_ACTOR = { _id: null, role: 'SYSTEM' };

/** Where each answer goes next, and what to skip. */
const NEXT = {
  GREETING: 'ASK_LANGUAGE',
  ASK_LANGUAGE: 'ASK_CONSENT',
  ASK_CONSENT: 'ASK_NAME',
  ASK_NAME: 'ASK_SURNAME',
  ASK_SURNAME: 'ASK_GENDER',
  ASK_GENDER: 'ASK_DOB',
  ASK_DOB: 'ASK_NATIONALITY',
  ASK_NATIONALITY: 'ASK_IMMIGRATION_STATUS',
  ASK_IMMIGRATION_STATUS: 'ASK_PERMIT_NUMBER',
  ASK_PERMIT_NUMBER: 'ASK_PERMIT_UPLOAD',
  ASK_PERMIT_UPLOAD: 'ASK_SERVICE',
  ASK_SERVICE: 'CONFIRM',
  CONFIRM: 'DONE',
};

const SKIP_WORDS = ['skip', 'none', 'no', 'later', 'passer', 'ruka', 'pular'];

const isControl = (text, list) => list.includes(String(text ?? '').trim().toLowerCase());

/** The prompt for a state, already rendered. */
function ask(state, session) {
  const lang = session.language ?? FALLBACK_LANGUAGE;
  const value = prompt(lang, state);

  if (typeof value !== 'function') return value;
  if (state === 'ASK_LANGUAGE') return value(TRANSLATED);
  if (state === 'CONFIRM') return value(summarise(session.draft, lang));
  return value();
}

/**
 * Move to a state, skipping the permit questions for someone who has no permit.
 *
 * Asking an undocumented person for a permit number is not merely useless — it is the
 * moment a person decides the service is not for them.
 */
function advance(session, from) {
  let next = NEXT[from];

  if (next === 'ASK_PERMIT_NUMBER' && NO_PERMIT_STATUSES.includes(session.draft.immigrationStatus)) {
    next = 'ASK_SERVICE';
  }
  if (next === 'ASK_PERMIT_UPLOAD' && !session.draft.permitNumber) {
    next = 'ASK_SERVICE';
  }
  session.state = next;
  return next;
}

// --- entry point ---------------------------------------------------------------------

/**
 * Handle one inbound message and return what to reply.
 *
 * Called after the webhook has already answered Meta, so a slow classification never
 * causes a retry. Always resolves: an unexpected error becomes an apology, not silence.
 */
export async function handleMessage({ from, body = '', mediaId = null, messageId = null, ctx = {} }) {
  const phone = normalisePhone(from);
  if (!phone) {
    logger.warn('inbound WhatsApp message with an unparseable sender');
    return null;
  }

  try {
    const session = await loadSession(phone);

    // Meta retries on any non-200. Replaying the same message would advance the
    // conversation twice and ask the next question out of order.
    if (messageId && session.lastInboundMessageId === messageId) {
      logger.info('duplicate inbound message ignored');
      return null;
    }
    session.lastInboundMessageId = messageId;
    session.touch();

    const reply = await route(session, String(body ?? '').trim(), mediaId, ctx);
    return reply;
  } catch (err) {
    logger.error({ err }, 'WhatsApp bot failed to handle a message');
    return prompt(FALLBACK_LANGUAGE, 'ERROR');
  }
}

async function loadSession(phone) {
  const existing = await WhatsAppSession.findOne({ from: phone }).exec();
  if (existing) return existing;

  return new WhatsAppSession({
    from: phone,
    state: 'GREETING',
    expiresAt: new Date(Date.now() + SESSION_TTL_HOURS * 3600 * 1000),
  });
}

/** Control words and safety checks first, then the state machine. */
async function route(session, text, mediaId, ctx) {
  const lang = session.language ?? FALLBACK_LANGUAGE;

  if (isControl(text, CONTROL_WORDS.CANCEL)) {
    // Everything goes, including a partly filled draft.
    await session.deleteOne();
    return prompt(lang, 'CANCELLED');
  }

  if (isControl(text, CONTROL_WORDS.RESTART)) {
    session.state = 'ASK_LANGUAGE';
    session.draft = {};
    session.consent = { given: null, askedAt: null, answeredAt: null };
    await session.save();
    return `${prompt(lang, 'RESTARTED')}\n\n${ask('ASK_LANGUAGE', session)}`;
  }

  if (isControl(text, CONTROL_WORDS.HELP)) {
    await session.save();
    return `${prompt(lang, 'HELP')}\n\n${ask(session.state, session)}`;
  }

  // Checked in every state and never routed through a model. Prepended rather than
  // replacing the flow, so someone in danger gets numbers without losing their place.
  if (looksUrgent(text)) {
    await session.save();
    await audit.record({
      actor: BOT_ACTOR,
      action: ACTIONS.SERVICE_REQUEST_CREATED,
      targetType: 'WhatsAppSession',
      targetId: session._id,
      ctx,
      meta: { channel: 'WHATSAPP', urgent: true, state: session.state },
    });
    return `${prompt(lang, 'URGENT')}\n\n${ask(session.state, session)}`;
  }

  return handleState(session, text, mediaId, ctx);
}

// --- the states ------------------------------------------------------------------------

async function handleState(session, text, mediaId, ctx) {
  const lang = session.language ?? FALLBACK_LANGUAGE;
  const state = session.state;

  // Someone already registered is not put through it again.
  if (state === 'DONE' && session.beneficiary) {
    const existing = await Beneficiary.findById(session.beneficiary).select('referenceCode').exec();
    await session.save();
    return prompt(lang, 'ALREADY_REGISTERED')(existing?.referenceCode ?? '—');
  }

  switch (state) {
    case 'GREETING': {
      advance(session, 'GREETING');
      await session.save();
      return `${prompt(lang, 'GREETING')}\n\n${ask('ASK_LANGUAGE', session)}`;
    }

    case 'ASK_LANGUAGE': {
      const index = Number(String(text).trim()) - 1;
      const chosen = TRANSLATED[index];
      if (!chosen) {
        await session.save();
        return `${prompt(lang, 'INVALID_OPTION')(TRANSLATED.length)}\n\n${ask('ASK_LANGUAGE', session)}`;
      }
      session.language = chosen;
      session.consent.askedAt = new Date();
      advance(session, 'ASK_LANGUAGE');
      await session.save();
      return ask('ASK_CONSENT', session);
    }

    case 'ASK_CONSENT': {
      // No classifier here. Reading "no" as "yes" would mean registering someone who
      // refused, which is the one mistake this whole flow exists to prevent.
      const answer = matchYesNo(text);
      if (answer === null) {
        await session.save();
        return `${prompt(session.language, 'INVALID_OPTION')(2)}\n\n${ask('ASK_CONSENT', session)}`;
      }

      if (answer === false) {
        const declined = prompt(session.language, 'CONSENT_DECLINED');
        // Deleted, not marked. Nothing about this person survives the refusal.
        await session.deleteOne();
        await audit.record({
          actor: BOT_ACTOR,
          action: ACTIONS.CONSENT_WITHDRAWN,
          targetType: 'WhatsAppSession',
          ctx,
          // No phone number: the point of the deletion is that nothing identifies them.
          meta: { channel: 'WHATSAPP', outcome: 'declined_at_intake' },
        });
        return declined;
      }

      session.consent.given = true;
      session.consent.answeredAt = new Date();
      advance(session, 'ASK_CONSENT');
      await session.save();
      return ask('ASK_NAME', session);
    }

    case 'ASK_NAME':
    case 'ASK_SURNAME': {
      const value = text.trim();
      if (value.length < 1 || value.length > 80) {
        await session.save();
        return `${prompt(session.language, 'INVALID_TEXT')}\n\n${ask(state, session)}`;
      }
      session.draft[state === 'ASK_NAME' ? 'firstName' : 'lastName'] = value;
      session.markModified('draft');
      const next = advance(session, state);
      await session.save();
      return ask(next, session);
    }

    case 'ASK_GENDER': {
      const { value } = await matchOption(text, GENDER_OPTIONS, {
        instruction: 'Which gender did the person indicate?',
        keywords: GENDER_KEYWORDS,
      });
      if (!value) {
        await session.save();
        return `${prompt(session.language, 'INVALID_OPTION')(GENDER_OPTIONS.length)}\n\n${ask(state, session)}`;
      }
      session.draft.gender = value;
      session.markModified('draft');
      const next = advance(session, state);
      await session.save();
      return ask(next, session);
    }

    case 'ASK_DOB': {
      const value = text.trim();
      // Strict: a misread date of birth decides whether a child is treated as a child.
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
        await session.save();
        return `${prompt(session.language, 'INVALID_DATE')}`;
      }
      const date = new Date(`${value}T00:00:00.000Z`);
      if (date.getTime() > Date.now()) {
        await session.save();
        return prompt(session.language, 'INVALID_DATE');
      }
      session.draft.dateOfBirth = value;
      session.markModified('draft');
      const next = advance(session, state);
      await session.save();
      return ask(next, session);
    }

    case 'ASK_NATIONALITY': {
      const value = text.trim();
      if (value.length < 2 || value.length > 60) {
        await session.save();
        return `${prompt(session.language, 'INVALID_TEXT')}\n\n${ask(state, session)}`;
      }
      session.draft.nationality = value;
      session.markModified('draft');
      const next = advance(session, state);
      await session.save();
      return ask(next, session);
    }

    case 'ASK_IMMIGRATION_STATUS': {
      const { value } = await matchOption(text, IMMIGRATION_OPTIONS, {
        instruction: 'Which South African immigration status did the person describe?',
        keywords: IMMIGRATION_KEYWORDS,
      });
      if (!value) {
        await session.save();
        return `${prompt(session.language, 'INVALID_OPTION')(IMMIGRATION_OPTIONS.length)}\n\n${ask(state, session)}`;
      }
      session.draft.immigrationStatus = value;
      session.markModified('draft');
      const next = advance(session, state);
      await session.save();
      return ask(next, session);
    }

    case 'ASK_PERMIT_NUMBER': {
      if (!isControl(text, SKIP_WORDS)) {
        session.draft.permitNumber = text.trim().slice(0, 40);
        session.markModified('draft');
      }
      const next = advance(session, state);
      await session.save();
      return ask(next, session);
    }

    case 'ASK_PERMIT_UPLOAD': {
      if (mediaId && !isControl(text, SKIP_WORDS)) {
        // Held as a pointer only. The image is fetched and stored at finalise(), so a
        // person who never confirms leaves no document behind either.
        session.draft.pendingMediaId = mediaId;
        session.markModified('draft');
      }
      const next = advance(session, state);
      await session.save();
      return ask(next, session);
    }

    case 'ASK_SERVICE': {
      const { value } = await matchOption(text, SERVICE_OPTIONS, {
        instruction: 'Which kind of help did the person ask for?',
        keywords: SERVICE_KEYWORDS,
      });
      if (!value) {
        await session.save();
        return `${prompt(session.language, 'INVALID_OPTION')(SERVICE_OPTIONS.length)}\n\n${ask(state, session)}`;
      }
      session.draft.service = value;
      session.markModified('draft');
      advance(session, state);
      await session.save();
      return ask('CONFIRM', session);
    }

    case 'CONFIRM': {
      const answer = matchYesNo(text);
      if (answer === null) {
        await session.save();
        return `${prompt(session.language, 'INVALID_OPTION')(2)}\n\n${ask('CONFIRM', session)}`;
      }
      if (answer === false) {
        session.state = 'ASK_NAME';
        session.draft = {};
        session.markModified('draft');
        await session.save();
        return `${prompt(session.language, 'RESTARTED')}\n\n${ask('ASK_NAME', session)}`;
      }
      return finalise(session, ctx);
    }

    default: {
      session.state = 'GREETING';
      await session.save();
      return ask('GREETING', session);
    }
  }
}

/**
 * The only place a session becomes a person.
 *
 * Everything before this is reversible. If this throws, the session stays exactly as it
 * was so the person can confirm again rather than starting over.
 */
async function finalise(session, ctx) {
  const d = session.draft;

  // A child cannot be registered without a recorded guardian, and the bot has no way to
  // establish one — so it hands over to a caseworker rather than creating a record the
  // model would reject anyway.
  if (isMinor(new Date(`${d.dateOfBirth}T00:00:00.000Z`))) {
    session.state = 'DONE';
    await session.save();
    await audit.record({
      actor: BOT_ACTOR,
      action: ACTIONS.BENEFICIARY_CREATED,
      status: 'failure',
      targetType: 'WhatsAppSession',
      targetId: session._id,
      ctx,
      meta: { channel: 'WHATSAPP', outcome: 'minor_requires_guardian' },
    });
    return (
      'Thank you. Because this registration is for someone under 18, a caseworker needs to ' +
      'complete it with a parent or guardian present.\n\n' +
      'Please visit our office in Rustenburg, or reply and someone will contact you.'
    );
  }

  const beneficiary = await createBeneficiary(
    {
      firstName: d.firstName,
      lastName: d.lastName,
      gender: d.gender,
      dateOfBirth: new Date(`${d.dateOfBirth}T00:00:00.000Z`),
      nationality: d.nationality,
      languages: [session.language ?? FALLBACK_LANGUAGE],
      immigration: {
        status: d.immigrationStatus,
        ...(d.permitNumber ? { permitNumber: d.permitNumber } : {}),
      },
      contact: { cellphone: session.from },
      consent: {
        given: true,
        method: 'WHATSAPP',
        policyVersion: '1.0',
        givenAt: session.consent.answeredAt,
      },
      intakeChannel: 'WHATSAPP',
    },
    // The bot has no User row, so it registers as the capturer of its own intakes. The
    // audit trail carries the channel.
    { _id: null, role: 'SYSTEM' },
    ctx
  );

  session.beneficiary = beneficiary._id;
  session.state = 'DONE';
  // The draft is no longer needed — the record is the record.
  session.draft = { service: d.service };
  session.markModified('draft');
  await session.save();

  return prompt(session.language, 'DONE')(beneficiary.referenceCode);
}

/**
 * Deliver a reply. Split from handleMessage so the state machine can be tested without
 * Meta, and so a send failure cannot roll back a saved step.
 */
export async function respond(to, reply) {
  if (!reply) return false;
  return sendMessage(to, reply);
}
