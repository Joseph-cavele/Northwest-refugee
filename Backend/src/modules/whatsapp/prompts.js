import { GENDER, IMMIGRATION_STATUS, SERVICE_CATEGORIES } from '../../config/constants.js';

// Every word a beneficiary reads. Nothing in the state machine hard-codes English.
//
// TRANSLATIONS: only `en` is written. fr / sw / pt need a native speaker — machine
// translation of consent wording and immigration terms is exactly where this would do
// harm. TRANSLATED below is what ASK_LANGUAGE actually offers, so the bot never invites
// someone into a language it cannot then speak. Adding a language here turns it on.

export const TRANSLATED = Object.freeze(['en']);
export const FALLBACK_LANGUAGE = 'en';

export const LANGUAGE_LABELS = Object.freeze({
  en: 'English',
  fr: 'Français',
  sw: 'Kiswahili',
  pt: 'Português',
});

// Words that work in any of the four languages, so a person can always get out.
export const CONTROL_WORDS = Object.freeze({
  RESTART: ['restart', 'start', 'begin', 'recommencer', 'anza', 'recomeçar'],
  CANCEL: ['cancel', 'stop', 'quit', 'annuler', 'ghairi', 'cancelar'],
  HELP: ['help', 'aide', 'msaada', 'ajuda'],
});

const numbered = (items) => items.map((item, i) => `${i + 1}. ${item}`).join('\n');

export const GENDER_OPTIONS = Object.freeze(['FEMALE', 'MALE', 'OTHER', 'UNDISCLOSED']);

// A shortlist, not the full enum. Thirteen options on a phone screen is not a question,
// it is a wall — "something else" covers the rest and a caseworker refines it later.
export const SERVICE_OPTIONS = Object.freeze([
  'LEGAL_DOCUMENTATION',
  'FOOD_ASSISTANCE',
  'SHELTER',
  'HEALTHCARE',
  'EDUCATION_PLACEMENT',
  'SKILLS_TRAINING',
  'GBV_SUPPORT',
  'OTHER',
]);

export const IMMIGRATION_OPTIONS = Object.freeze([
  'ASYLUM_SEEKER',
  'REFUGEE',
  'PERMANENT_RESIDENT',
  'WORK_VISA',
  'SA_CITIZEN',
  'UNDOCUMENTED',
  'OTHER',
]);

// Statuses that have no permit number to ask for. Asking an undocumented person for a
// permit three times is how a bot loses the trust of the people it exists for.
export const NO_PERMIT_STATUSES = Object.freeze(['UNDOCUMENTED', 'SA_CITIZEN']);

const en = {
  GREETING:
    'Hello, and welcome to North West House of Refuge.\n\n' +
    'We support refugees, asylum seekers and migrants in Rustenburg. I can register you so a caseworker can help.\n\n' +
    'You can type CANCEL at any time to stop, or RESTART to begin again.',

  ASK_LANGUAGE: (languages) =>
    'Which language would you like to continue in?\n\n' +
    `${numbered(languages.map((l) => LANGUAGE_LABELS[l] ?? l))}\n\n` +
    'Reply with the number.',

  // The consent wording is the legal basis for everything that follows. It must say what
  // is collected, what it is for, and that refusing is a real option with no penalty.
  ASK_CONSENT:
    'Before we start, I need your permission.\n\n' +
    'To help you, we record your name, date of birth, nationality, immigration status and contact number. ' +
    'We use it only to provide services to you and to report totals — never your name — to our funders. ' +
    'Your information is stored securely and you can ask us to stop using it at any time.\n\n' +
    'If you say no, nothing is saved and this conversation is deleted. You can still visit our office for help.\n\n' +
    'Do you agree?\n1. Yes\n2. No',

  CONSENT_DECLINED:
    'That is completely fine — nothing has been saved and this conversation is now deleted.\n\n' +
    'You are still welcome at our office in Rustenburg, and you can message again any time.',

  ASK_NAME: 'Thank you. What is your first name?',
  ASK_SURNAME: 'And your surname?',

  ASK_GENDER: () =>
    'How would you describe your gender?\n\n' +
    '1. Female\n2. Male\n3. Other\n4. Prefer not to say\n\n' +
    'Reply with the number.',

  ASK_DOB:
    'What is your date of birth?\n\nPlease use the format YYYY-MM-DD, for example 1994-03-21.',

  ASK_NATIONALITY: 'What is your nationality? (For example: Democratic Republic of the Congo)',

  ASK_IMMIGRATION_STATUS: () =>
    'What is your current status in South Africa?\n\n' +
    '1. Asylum seeker (section 22)\n' +
    '2. Refugee (section 24)\n' +
    '3. Permanent resident\n' +
    '4. Work visa\n' +
    '5. South African citizen\n' +
    '6. No documents\n' +
    '7. Something else\n\n' +
    'Reply with the number. There is no wrong answer, and we help people without documents.',

  ASK_PERMIT_NUMBER:
    'What is your permit number?\n\nIf you do not have it with you, reply SKIP and we can add it later.',

  ASK_PERMIT_UPLOAD:
    'If you have a photo of your permit, please send it now.\n\nIf not, reply SKIP — it is not required.',

  ASK_SERVICE: () =>
    'What do you need help with most right now?\n\n' +
    '1. Papers, permits or documents\n' +
    '2. Food\n' +
    '3. A safe place to stay\n' +
    '4. Health care\n' +
    '5. School for a child\n' +
    '6. Training or work\n' +
    '7. I am not safe\n' +
    '8. Something else\n\n' +
    'Reply with the number.',

  CONFIRM: (summary) =>
    'Please check that this is right:\n\n' +
    `${summary}\n\n` +
    '1. Yes, that is correct\n2. No, start again\n\n' +
    'Nothing is saved until you confirm.',

  DONE: (reference) =>
    'Thank you — you are registered.\n\n' +
    `Your reference number is *${reference}*. Please keep it; you will be asked for it when you visit.\n\n` +
    'A caseworker will be in touch. If your situation is urgent, come to our office in Rustenburg.',

  ALREADY_REGISTERED: (reference) =>
    `You are already registered with us. Your reference number is *${reference}*.\n\n` +
    'If you need help with something new, please reply and a caseworker will see it, or come to our office.',

  // Sent by the permit-expiry job, not by the state machine. Deliberately calm: a lapsed
  // section 22 permit is grounds for arrest, the reminder may be read on a shared phone,
  // and a message that frightens someone into avoiding us has done the opposite of its job.
  // It says nothing about which permit or what status — only that we can help.
  PERMIT_EXPIRY: (daysRemaining) =>
    daysRemaining > 0
      ? 'Hello, this is North West House of Refuge.\n\n' +
        `Our records show your permit is due for renewal in ${daysRemaining} ` +
        `${daysRemaining === 1 ? 'day' : 'days'}. Renewing before it lapses is far easier ` +
        'than afterwards.\n\n' +
        'We can help you prepare the renewal. Reply to this message, or visit our office in Rustenburg.'
      : 'Hello, this is North West House of Refuge.\n\n' +
        'Our records show your permit is now past its renewal date. It can still be renewed, ' +
        'and we can help you do it.\n\n' +
        'Reply to this message, or visit our office in Rustenburg.',

  CANCELLED:
    'No problem — this conversation has been deleted and nothing was saved.\n\nMessage again whenever you are ready.',

  RESTARTED: 'Starting again.',

  HELP:
    'I am registering you with North West House of Refuge so a caseworker can help.\n\n' +
    'Reply RESTART to begin again, or CANCEL to stop and delete everything.',

  // Kept gentle on purpose. Someone answering on a borrowed phone in a second language
  // should not be made to feel they have failed.
  INVALID_OPTION: (max) => `Sorry, I did not understand. Please reply with a number from 1 to ${max}.`,
  INVALID_DATE:
    'Sorry, I could not read that date. Please use YYYY-MM-DD, for example 1994-03-21.',
  INVALID_TEXT: 'Sorry, I did not catch that. Could you type it again?',

  // Urgent safety wording, sent whatever state the conversation is in.
  URGENT:
    'If you are in danger right now, please contact:\n\n' +
    'Police: 10111\n' +
    'GBV Command Centre (24 hours): 0800 428 428\n' +
    'Childline: 116\n\n' +
    'We will also flag this to a caseworker.',

  ERROR:
    'Sorry, something went wrong on our side. Nothing was lost — please send your last message again.',
};

const PROMPTS = Object.freeze({ en });

/**
 * Look up a prompt for a language, falling back to English.
 *
 * The fallback exists so a missing string can never leave a person with silence, but
 * ASK_LANGUAGE only offers TRANSLATED languages, so in practice it should not fire.
 */
export function prompt(language, key) {
  const table = PROMPTS[language] ?? PROMPTS[FALLBACK_LANGUAGE];
  return table[key] ?? PROMPTS[FALLBACK_LANGUAGE][key];
}

/** Human-readable summary for the CONFIRM step, in the person's own language. */
export function summarise(draft, language = FALLBACK_LANGUAGE) {
  void language;
  const lines = [
    `Name: ${draft.firstName ?? ''} ${draft.lastName ?? ''}`.trim(),
    `Date of birth: ${draft.dateOfBirth ?? '—'}`,
    `Nationality: ${draft.nationality ?? '—'}`,
    `Status: ${(draft.immigrationStatus ?? '—').replace(/_/g, ' ').toLowerCase()}`,
  ];
  if (draft.permitNumber) lines.push('Permit number: on file');
  if (draft.service) lines.push(`Needs help with: ${draft.service.replace(/_/g, ' ').toLowerCase()}`);
  return lines.join('\n');
}

// Guards so a renamed constant fails at import rather than at 2am in a conversation.
for (const g of GENDER_OPTIONS) if (!GENDER.includes(g)) throw new Error(`Unknown gender option: ${g}`);
for (const s of IMMIGRATION_OPTIONS) {
  if (!IMMIGRATION_STATUS.includes(s)) throw new Error(`Unknown immigration status: ${s}`);
}
for (const s of SERVICE_OPTIONS) {
  if (!SERVICE_CATEGORIES.includes(s)) throw new Error(`Unknown service category: ${s}`);
}

export default PROMPTS;
