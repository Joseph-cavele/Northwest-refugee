import { classify, isOpenAIConfigured } from '../../config/openai.js';
import { GUIDE, DEFAULT_LANGUAGE } from './guide.content.js';

// Free-text matching for the help widget.
//
// The model chooses which of our written screens best fits what a person typed. It does
// not answer them. The reply they read is always the screen's own text, written by the
// organisation and reviewed in version control.
//
// This is the pattern CLAUDE.md sanctions — classify onto a fixed option list, echo the
// match back for confirmation — applied to the website rather than the WhatsApp bot.

// The screens a person may be routed to. Deliberately not every node: `register` and the
// pillar pages are reachable by choosing an option, but routing someone straight there
// from "I am being beaten at home" would be wrong.
export const ROUTABLE_STEPS = Object.freeze([
  'help-documents',
  'help-food',
  'help-shelter',
  'help-school',
  'help-safety',
  'help-skills',
  'help-other',
  'about',
  'support',
  'contact',
]);

const INSTRUCTION = [
  'You are routing a visitor on the website of a South African nonprofit that helps',
  'refugees, asylum seekers and migrants. Given what the visitor typed, choose the single',
  'page that best matches what they need.',
  '',
  'help-documents = permits, asylum papers, birth certificates, Home Affairs',
  'help-food      = hunger, food parcels, groceries',
  'help-shelter   = homelessness, nowhere to sleep, accommodation',
  'help-school    = enrolling a child in school, a school refusing a child',
  'help-safety    = violence, abuse, danger, a child at risk',
  'help-skills    = training, work, starting a business',
  'help-other     = a real need that none of the above covers',
  'about          = asking what the organisation does',
  'support        = wanting to donate, volunteer or partner',
  'contact        = wanting to speak to a person',
  '',
  'The visitor may write in English, French, Swahili or Portuguese.',
].join('\n');

// Long enough for someone to explain their situation, short enough that the endpoint
// cannot be used as a general-purpose model proxy.
export const MAX_INPUT_LENGTH = 300;

/**
 * Anything that reads as danger goes straight to the safety screen without asking a model.
 *
 * Two reasons. A timeout or an outage must never be what stands between a person and an
 * emergency number. And a classifier that is right 98% of the time is not good enough for
 * the 2% where someone is being hurt.
 */
const URGENT_PATTERNS = [
  /\b(rape|raped|assault|assaulted|beat(en|ing)?|abus(e|ed|ing))\b/i,
  /\b(kill|killed|killing|murder|die|dying|suicide)\b/i,
  /\b(danger|threat(en(ed|ing))?|unsafe|not safe|help me now|emergency)\b/i,
  /\b(traffick(ed|ing)|kidnap(ped)?)\b/i,
];

function looksUrgent(text) {
  return URGENT_PATTERNS.some((p) => p.test(text));
}

/**
 * Match free text to a screen.
 *
 * Always resolves. `source` says how the match was made, so the widget can behave
 * differently — a `safety-rule` match should be shown immediately, an `ai` match should
 * be confirmed before navigating.
 *
 * @returns {Promise<{ stepId: string, source: 'safety-rule'|'ai'|'fallback',
 *                     requiresConfirmation: boolean, matched: boolean }>}
 */
export async function matchStep(text, language = DEFAULT_LANGUAGE) {
  const input = String(text ?? '').trim().slice(0, MAX_INPUT_LENGTH);

  if (looksUrgent(input)) {
    // Shown at once. Making someone confirm "did you mean: I am not safe?" before giving
    // them a number is the wrong behaviour at the wrong moment.
    return { stepId: 'help-safety', source: 'safety-rule', requiresConfirmation: false, matched: true };
  }

  if (!input || !isOpenAIConfigured()) {
    return { stepId: 'need-help', source: 'fallback', requiresConfirmation: false, matched: false };
  }

  const answer = await classify({ instruction: INSTRUCTION, allowed: ROUTABLE_STEPS, input });

  // NONE, a timeout, an outage, or anything off the list: show the menu. A wrong guess is
  // worse than asking.
  if (!answer || !(answer in (GUIDE[DEFAULT_LANGUAGE] ?? {}))) {
    return { stepId: 'need-help', source: 'fallback', requiresConfirmation: false, matched: false };
  }

  void language;
  return {
    stepId: answer,
    source: 'ai',
    // The widget must echo the screen's title back — "Did you mean: School for a child?"
    // — before navigating. A guess presented as an answer is how people end up acting on
    // the wrong information.
    requiresConfirmation: true,
    matched: true,
  };
}
