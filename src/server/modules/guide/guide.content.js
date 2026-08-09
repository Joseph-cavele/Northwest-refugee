import { PROGRAMME_PILLARS } from '../../config/constants.js';

// The scripted guide behind the public website's help widget.
//
// WHY THIS IS CODE AND NOT A DATABASE TABLE, AND WHY NO MODEL ANSWERS IT:
// every word here is read by someone deciding what to do about their immigration status,
// their child's schooling, or their safety. A wrong sentence about a permit renewal can
// cost a person their status, and the people asking are the least able to catch the
// error. So the answers are fixed, reviewed in version control, and never generated.
//
// The bot matches a person to a path. It does not advise, and it never guesses.
//
// TRANSLATIONS: only `en` is written. Machine-translating safety-critical service
// information is precisely the failure this design exists to avoid, so the API reports
// `translated: false` and falls back to English rather than serving text nobody has read.
// fr / sw / pt need a native speaker before they go in.

export const GUIDE_VERSION = '1.0';
export const DEFAULT_LANGUAGE = 'en';
export const TRANSLATED_LANGUAGES = Object.freeze(['en']);

/**
 * Every node is one screen: something said, and a set of ways onward.
 *
 *   options — go to another node
 *   actions — leave the widget: open WhatsApp, call, visit a page
 */
const en = {
  root: {
    id: 'root',
    title: 'How can we help?',
    message:
      'North West House of Refuge supports refugees, asylum seekers and migrants in Rustenburg. Tell us what you are looking for.',
    options: [
      { label: 'I need help', next: 'need-help' },
      { label: 'What does NWHR do?', next: 'about' },
      { label: 'I want to support the work', next: 'support' },
      { label: 'Talk to someone', next: 'contact' },
    ],
  },

  // --- getting help ------------------------------------------------------------------
  'need-help': {
    id: 'need-help',
    title: 'What do you need help with?',
    message: 'Choose the closest one. If nothing fits, choose “Something else” and we will talk to you.',
    options: [
      { label: 'Papers, permits or documents', next: 'help-documents' },
      { label: 'Food', next: 'help-food' },
      { label: 'A safe place to stay', next: 'help-shelter' },
      { label: 'School for a child', next: 'help-school' },
      { label: 'I am not safe', next: 'help-safety' },
      { label: 'Work or skills training', next: 'help-skills' },
      { label: 'Something else', next: 'help-other' },
    ],
    back: 'root',
  },

  'help-documents': {
    id: 'help-documents',
    title: 'Papers, permits and documents',
    message:
      'We help with asylum and refugee permit applications and renewals, birth registration, and referrals to legal partners. We cannot decide your application — that is Home Affairs — but we can help you prepare it and go with you.',
    note: 'Bring whatever documents you already have. If you have none, come anyway — that is a common reason people come to us.',
    options: [{ label: 'How do I start?', next: 'register' }],
    back: 'need-help',
  },

  'help-food': {
    id: 'help-food',
    title: 'Food',
    message:
      'We run food support for families who are struggling. Availability changes month to month, so the fastest way to find out is to register and speak to a caseworker.',
    options: [{ label: 'How do I start?', next: 'register' }],
    back: 'need-help',
  },

  'help-shelter': {
    id: 'help-shelter',
    title: 'A safe place to stay',
    message:
      'We do not run a shelter ourselves, but we work with partners in the North West who do, and a caseworker can refer you. If you are in immediate danger, say so when you contact us and we will treat it as urgent.',
    options: [
      { label: 'I am in danger right now', next: 'help-safety' },
      { label: 'How do I start?', next: 'register' },
    ],
    back: 'need-help',
  },

  'help-school': {
    id: 'help-school',
    title: 'School for a child',
    message:
      'We help place children in school and follow up when a school refuses admission. A school may not refuse a child because the family has no documents — if that has happened to you, tell us, because we take it up.',
    note: 'This applies whatever your immigration status is.',
    options: [{ label: 'How do I start?', next: 'register' }],
    back: 'need-help',
  },

  'help-safety': {
    id: 'help-safety',
    title: 'If you are not safe',
    message:
      'If you are in immediate danger, contact the emergency services first. We support survivors of gender-based violence and children at risk, and we can refer you to specialised partners.',
    // Public emergency numbers, not organisation numbers — these must work at 2am.
    actions: [
      { type: 'phone', label: 'Police (SAPS)', value: '10111' },
      { type: 'phone', label: 'GBV Command Centre (24 hours)', value: '0800428428' },
      { type: 'phone', label: 'Childline South Africa', value: '116' },
    ],
    options: [{ label: 'Contact NWHR', next: 'contact' }],
    back: 'need-help',
    urgent: true,
  },

  'help-skills': {
    id: 'help-skills',
    title: 'Work and skills',
    message:
      'We run skills training and support small cooperatives — sewing, catering, crafts and others — so that people can earn an income. Groups start at set times of the year, so ask us what is running now.',
    options: [{ label: 'How do I start?', next: 'register' }],
    back: 'need-help',
  },

  'help-other': {
    id: 'help-other',
    title: 'Something else',
    message:
      'If none of those fit, that is fine. Speak to a caseworker and describe the situation in your own words.',
    options: [{ label: 'How do I start?', next: 'register' }],
    back: 'need-help',
  },

  // --- registering -------------------------------------------------------------------
  register: {
    id: 'register',
    title: 'Getting started',
    message:
      'Register once and a caseworker will work through your situation with you. You can do it on WhatsApp, or come to the office.',
    note: 'We will ask your permission before recording anything about you, and you can say no.',
    actions: [
      { type: 'whatsapp', label: 'Start on WhatsApp', value: null },
      { type: 'link', label: 'Where to find us', value: '/contact' },
    ],
    options: [{ label: 'What will you ask me?', next: 'what-we-ask' }],
    back: 'need-help',
  },

  'what-we-ask': {
    id: 'what-we-ask',
    title: 'What we will ask',
    message:
      'Your name, date of birth, nationality, immigration status and a contact number, and what you need help with. If you have a permit we will ask for the number so we can help with renewals.',
    note:
      'Your permit number is stored encrypted and only staff who need it can see it, every time it is opened. You can ask us to stop using your information at any time.',
    options: [{ label: 'Start registering', next: 'register' }],
    back: 'register',
  },

  // --- about -------------------------------------------------------------------------
  about: {
    id: 'about',
    title: 'What NWHR does',
    message:
      'North West House of Refuge works with refugees, asylum seekers and migrants in Rustenburg. Our work runs across five areas.',
    options: [
      { label: 'Advocacy and documentation', next: 'pillar-advocacy' },
      { label: 'Skills and entrepreneurship', next: 'pillar-skills' },
      { label: 'Education', next: 'pillar-education' },
      { label: 'Social cohesion', next: 'pillar-cohesion' },
      { label: 'Women and youth', next: 'pillar-women-youth' },
    ],
    back: 'root',
  },

  'pillar-advocacy': {
    id: 'pillar-advocacy',
    pillar: PROGRAMME_PILLARS.ADVOCACY_DOCUMENTATION,
    title: 'Advocacy and documentation',
    message:
      'Helping people get and keep the papers they are entitled to — permit applications and renewals, birth registration, and taking up cases where rights are being denied.',
    options: [{ label: 'I need help with papers', next: 'help-documents' }],
    back: 'about',
  },
  'pillar-skills': {
    id: 'pillar-skills',
    pillar: PROGRAMME_PILLARS.SKILLS_ENTREPRENEURSHIP,
    title: 'Skills and entrepreneurship',
    message:
      'Training and support for cooperatives so people can earn an income rather than depend on aid.',
    options: [{ label: 'I want training or work', next: 'help-skills' }],
    back: 'about',
  },
  'pillar-education': {
    id: 'pillar-education',
    pillar: PROGRAMME_PILLARS.EDUCATION,
    title: 'Education',
    message:
      'Getting children into school and keeping them there, including when a school turns a child away for lack of documents.',
    options: [{ label: 'I need school for a child', next: 'help-school' }],
    back: 'about',
  },
  'pillar-cohesion': {
    id: 'pillar-cohesion',
    pillar: PROGRAMME_PILLARS.SOCIAL_COHESION,
    title: 'Social cohesion',
    message:
      'Bringing migrant and host communities together — dialogues, community events and practical support such as food and transport.',
    options: [{ label: 'I need food or other support', next: 'help-food' }],
    back: 'about',
  },
  'pillar-women-youth': {
    id: 'pillar-women-youth',
    pillar: PROGRAMME_PILLARS.WOMEN_YOUTH_EMPOWERMENT,
    title: 'Women and youth',
    message:
      'Support for survivors of gender-based violence, child protection, and programmes for young people.',
    options: [{ label: 'I am not safe', next: 'help-safety' }],
    back: 'about',
  },

  // --- supporting --------------------------------------------------------------------
  support: {
    id: 'support',
    title: 'Supporting the work',
    message: 'Donations pay for food, transport, permit fees and training materials.',
    actions: [
      { type: 'link', label: 'Donate', value: '/donate' },
      { type: 'link', label: 'Volunteer or partner with us', value: '/contact' },
    ],
    note: 'We issue a section 18A tax certificate for donations where we can.',
    back: 'root',
  },

  // --- contact -----------------------------------------------------------------------
  contact: {
    id: 'contact',
    title: 'Talk to someone',
    message: 'A person will answer. We speak English, French, Swahili and Portuguese.',
    actions: [
      { type: 'whatsapp', label: 'WhatsApp us', value: null },
      { type: 'link', label: 'Office address and hours', value: '/contact' },
    ],
    back: 'root',
  },
};

export const GUIDE = Object.freeze({ en });
export const ROOT_NODE_ID = 'root';
