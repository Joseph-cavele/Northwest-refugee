import AppError from '../../utils/AppError.js';
import env from '../../config/env.js';
import { LANGUAGES } from '../../config/constants.js';
import { toWhatsAppId } from '../../utils/phone.js';
import { GUIDE, GUIDE_VERSION, ROOT_NODE_ID, DEFAULT_LANGUAGE, TRANSLATED_LANGUAGES } from './guide.content.js';
import { matchStep } from './guide.intent.js';

// Serves the scripted guide behind the public help widget.
//
// Nothing here reads or writes a database, and nothing is generated. The service resolves
// a node, fills in the contact details from configuration, and returns it — so this
// endpoint cannot leak anything, cannot be made to say something nobody wrote, and works
// the same whether or not the database is up.

/**
 * A language we have actually written, or English.
 *
 * Falling back silently would serve English text under a French label, which reads as a
 * broken site to someone who cannot read it. `translated` lets the widget say so.
 */
function resolveLanguage(requested) {
  const lang = String(requested ?? DEFAULT_LANGUAGE).toLowerCase();

  if (!LANGUAGES.includes(lang)) {
    throw AppError.badRequest(`Unsupported language "${lang}" — available: ${LANGUAGES.join(', ')}`);
  }
  const translated = TRANSLATED_LANGUAGES.includes(lang);
  return { language: translated ? lang : DEFAULT_LANGUAGE, requested: lang, translated };
}

/**
 * Fill in the details that live in configuration rather than in the script, so a changed
 * WhatsApp number does not mean editing the content file.
 */
function hydrate(node) {
  if (!node.actions) return node;

  const whatsappId = toWhatsAppId(env.WHATSAPP_BUSINESS_NUMBER);

  return {
    ...node,
    actions: node.actions
      .map((action) => {
        if (action.type !== 'whatsapp') return action;
        // Drop the option rather than render a dead button.
        if (!whatsappId) return null;
        return { ...action, value: `https://wa.me/${whatsappId}` };
      })
      .filter(Boolean),
  };
}

/** One screen of the guide. */
export function getNode(id = ROOT_NODE_ID, requestedLanguage) {
  const { language, requested, translated } = resolveLanguage(requestedLanguage);

  const node = GUIDE[language]?.[id];
  if (!node) throw AppError.notFound('Guide step');

  return {
    version: GUIDE_VERSION,
    language,
    requestedLanguage: requested,
    translated,
    node: hydrate(node),
  };
}

/**
 * Match what a visitor typed to a screen, and return that screen.
 *
 * The reply is always our own written text. The model only decides *which* of our screens
 * to show — it never composes what the person reads.
 *
 * `requiresConfirmation` tells the widget to echo the title back ("Did you mean: School
 * for a child?") before navigating, so a wrong guess is corrected by the person rather
 * than acted on.
 */
export async function ask(text, requestedLanguage) {
  const { language, requested, translated } = resolveLanguage(requestedLanguage);
  const match = await matchStep(text, language);

  const node = GUIDE[language][match.stepId] ?? GUIDE[language][ROOT_NODE_ID];

  return {
    version: GUIDE_VERSION,
    language,
    requestedLanguage: requested,
    translated,
    matched: match.matched,
    source: match.source,
    requiresConfirmation: match.requiresConfirmation,
    // What to echo back before navigating.
    confirmPrompt: match.requiresConfirmation ? node.title : null,
    node: hydrate(node),
  };
}

/**
 * The whole tree in one request.
 *
 * The widget is small enough to hold all of it, and shipping it in one go means a person
 * on an intermittent connection can still work through the guide after the first load.
 */
export function getGuide(requestedLanguage) {
  const { language, requested, translated } = resolveLanguage(requestedLanguage);

  const nodes = Object.fromEntries(
    Object.entries(GUIDE[language]).map(([id, node]) => [id, hydrate(node)])
  );

  return {
    version: GUIDE_VERSION,
    language,
    requestedLanguage: requested,
    translated,
    availableLanguages: LANGUAGES,
    translatedLanguages: TRANSLATED_LANGUAGES,
    rootId: ROOT_NODE_ID,
    nodes,
  };
}
