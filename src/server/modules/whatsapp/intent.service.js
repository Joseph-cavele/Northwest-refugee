import { classify, isOpenAIConfigured } from '../../config/openai.js';

// Turning what someone typed into one of a fixed set of answers.
//
// The model NEVER supplies a value. It picks from a list this file passes it, the choice
// is rejected unless it is on that list, and the bot echoes every classified answer back
// at the CONFIRM step before anything is saved. A person who says "je suis demandeur
// d'asile" gets ASYLUM_SEEKER; a person who says something unclear gets asked again.
//
// Uses the shared client in config/openai.js.

/**
 * A reply is usually just a number. Try that first — it costs nothing, cannot be wrong,
 * and is what most people send.
 */
export function matchNumber(text, options) {
  const trimmed = String(text ?? '').trim();
  if (!/^\d{1,2}$/.test(trimmed)) return null;

  const index = Number(trimmed) - 1;
  return index >= 0 && index < options.length ? options[index] : null;
}

/**
 * Match free text against an option list.
 *
 * Order matters: a number, then an obvious word, then the model. Each step is cheaper and
 * more certain than the next, and the model is only reached when the first two cannot say.
 *
 * @returns {Promise<{ value: string|null, source: 'number'|'keyword'|'ai'|'none' }>}
 */
export async function matchOption(text, options, { instruction, keywords = {} } = {}) {
  const numbered = matchNumber(text, options);
  if (numbered) return { value: numbered, source: 'number' };

  const lowered = String(text ?? '').trim().toLowerCase();
  if (!lowered) return { value: null, source: 'none' };

  // A written answer that is unmistakable in any of the four languages.
  for (const [option, words] of Object.entries(keywords)) {
    if (!options.includes(option)) continue;
    if (words.some((w) => lowered === w || lowered.includes(w))) {
      return { value: option, source: 'keyword' };
    }
  }

  if (!isOpenAIConfigured()) return { value: null, source: 'none' };

  const answer = await classify({
    instruction:
      instruction ??
      'Choose the option that best matches what the person wrote. They may be writing in English, French, Swahili or Portuguese.',
    allowed: options,
    input: lowered.slice(0, 200),
  });

  // Anything off the list — including a helpful-sounding sentence — counts as not
  // understood, and the bot asks again rather than guessing.
  return answer ? { value: answer, source: 'ai' } : { value: null, source: 'none' };
}

// --- yes / no --------------------------------------------------------------------------

const YES = ['1', 'yes', 'y', 'yebo', 'ok', 'okay', 'agree', 'oui', 'ndiyo', 'ndio', 'sim'];
const NO = ['2', 'no', 'n', 'nope', 'non', 'hapana', 'não', 'nao'];

/**
 * Consent and confirmation are answered here WITHOUT the model, deliberately.
 *
 * Getting "no" wrong on the consent question means recording a person who refused. That
 * is not a risk worth a classifier, so an unrecognised answer is treated as unclear and
 * the question is asked again.
 */
export function matchYesNo(text) {
  const lowered = String(text ?? '').trim().toLowerCase();
  if (YES.includes(lowered)) return true;
  if (NO.includes(lowered)) return false;
  return null;
}

// --- keyword hints ---------------------------------------------------------------------
// Cheap matches for answers people actually type, so most conversations never reach the
// model at all.

export const GENDER_KEYWORDS = Object.freeze({
  FEMALE: ['female', 'woman', 'f', 'femme', 'mwanamke', 'mulher'],
  MALE: ['male', 'man', 'm', 'homme', 'mwanaume', 'homem'],
  OTHER: ['other', 'autre', 'nyingine', 'outro'],
  UNDISCLOSED: ['prefer not', 'rather not', 'skip', 'no say'],
});

export const IMMIGRATION_KEYWORDS = Object.freeze({
  ASYLUM_SEEKER: ['asylum', 'section 22', 's22', 'asile', 'hifadhi'],
  REFUGEE: ['refugee', 'section 24', 's24', 'réfugié', 'refugie', 'mkimbizi', 'refugiado'],
  PERMANENT_RESIDENT: ['permanent', 'pr', 'résident', 'residente'],
  WORK_VISA: ['work visa', 'work permit', 'travail'],
  SA_CITIZEN: ['citizen', 'south african', 'sa id', 'citoyen'],
  UNDOCUMENTED: ['no documents', 'no papers', 'undocumented', 'nothing', 'none', 'sans papiers'],
});

export const SERVICE_KEYWORDS = Object.freeze({
  LEGAL_DOCUMENTATION: ['permit', 'papers', 'document', 'home affairs', 'asylum', 'papier'],
  FOOD_ASSISTANCE: ['food', 'hungry', 'eat', 'nourriture', 'chakula', 'comida'],
  SHELTER: ['shelter', 'sleep', 'homeless', 'house', 'abri', 'makazi'],
  HEALTHCARE: ['health', 'sick', 'doctor', 'clinic', 'hospital', 'santé', 'afya'],
  EDUCATION_PLACEMENT: ['school', 'education', 'child', 'école', 'ecole', 'shule', 'escola'],
  SKILLS_TRAINING: ['training', 'skills', 'work', 'job', 'formation', 'kazi'],
  GBV_SUPPORT: ['abuse', 'violence', 'beaten', 'unsafe', 'danger', 'violence'],
});

/**
 * Anything that reads as danger, in any state of the conversation.
 *
 * Checked before the state machine and never routed through the model — a timeout must
 * not be what stands between someone and an emergency number.
 */
const URGENT_PATTERNS = [
  /\b(rape|raped|assault|assaulted|beat(en|ing)?|abus(e|ed|ing))\b/i,
  /\b(kill|killed|killing|murder|suicide)\b/i,
  /\b(danger|threat(en(ed|ing))?|unsafe|not safe|emergency|help me now)\b/i,
  /\b(traffick(ed|ing)|kidnap(ped)?)\b/i,
];

export function looksUrgent(text) {
  const value = String(text ?? '');
  return URGENT_PATTERNS.some((p) => p.test(value));
}
