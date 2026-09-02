import crypto from 'node:crypto';
import AppError from '../../utils/AppError.js';
import { paginateQuery } from '../../utils/paginate.js';
import * as audit from '../audit/audit.service.js';
import { ACTIONS } from '../audit/audit.model.js';
import { Intake } from '../intake/intake.model.js';
import { Programme } from '../programmes/programme.model.js';
import { createBeneficiary } from '../beneficiaries/beneficiary.service.js';
import {
  CHOICE_TYPES,
  OPEN_DECISIONS,
  Screening,
  ScreeningTemplate,
} from './screening.model.js';

/** Short, stable, and never reused within a template. Answers are keyed by these. */
const newKey = () => crypto.randomBytes(6).toString('hex');

// --- templates ---------------------------------------------------------------------------

/**
 * Give every new section, question and document type a key, and let every existing one keep
 * the key it already had.
 *
 * THIS FUNCTION IS THE WHOLE REASON EDITING A TEMPLATE IS SAFE. A question's key is what
 * answers are stored against, so re-minting keys on save would orphan every answer ever
 * given — the screenings would still exist, still have their answers, and those answers
 * would match nothing. Nothing would error. The data would simply stop meaning anything.
 *
 * So: a key that arrives is preserved verbatim, and only a genuinely new item gets one.
 */
function withKeys(sections = []) {
  return sections.map((section, sectionIndex) => ({
    ...section,
    key: section.key || newKey(),
    order: section.order ?? sectionIndex,
    questions: (section.questions ?? []).map((question, questionIndex) => ({
      ...question,
      key: question.key || newKey(),
      order: question.order ?? questionIndex,
      // Choice types keep their list; everything else must not carry one, so it is dropped
      // rather than stored and silently ignored at render.
      options: CHOICE_TYPES.includes(question.type) ? (question.options ?? []) : undefined,
    })),
  }));
}

function withDocumentKeys(types = []) {
  return types.map((type) => ({ ...type, key: type.key || newKey() }));
}

export async function createTemplate(data, actor, ctx = {}) {
  const doc = await ScreeningTemplate.create({
    ...data,
    sections: withKeys(data.sections),
    documentTypes: withDocumentKeys(data.documentTypes),
    status: 'DRAFT',
    version: 1,
    createdBy: actor._id,
  });

  await audit.record({
    actor,
    action: ACTIONS.SCREENING_TEMPLATE_CREATED,
    targetType: 'ScreeningTemplate',
    targetId: doc._id,
    ctx,
    meta: { name: doc.name, purpose: doc.purpose },
  });

  return doc;
}

export async function updateTemplate(id, patch, actor, ctx = {}) {
  const doc = await findTemplateOrFail(id);
  if (doc.status === 'ARCHIVED') throw AppError.conflict('An archived template cannot be edited');

  if (patch.sections) patch.sections = withKeys(patch.sections);
  if (patch.documentTypes) patch.documentTypes = withDocumentKeys(patch.documentTypes);

  doc.set(patch);
  /*
   * Editing a PUBLISHED template bumps its version. Screenings already taken hold their own
   * frozen copy and are untouched; the number is what lets somebody ask which wording a
   * given screening was answered against without diffing two documents.
   */
  if (doc.status === 'PUBLISHED' && (patch.sections || patch.documentTypes)) {
    doc.version += 1;
  }
  await doc.save();

  await audit.record({
    actor,
    action: ACTIONS.SCREENING_TEMPLATE_UPDATED,
    targetType: 'ScreeningTemplate',
    targetId: doc._id,
    ctx,
    meta: { fields: Object.keys(patch), version: doc.version },
  });

  return doc;
}

/** Publish, archive, or send back to draft. Its own act, like publishing an event. */
export async function setTemplateStatus(id, status, actor, ctx = {}) {
  const doc = await findTemplateOrFail(id);

  if (status === 'PUBLISHED') {
    const questions = (doc.sections ?? []).reduce((n, s) => n + (s.questions?.length ?? 0), 0);
    if (questions === 0) {
      // A published template with no questions renders an empty form that a screener cannot
      // fill in, and would then be attachable to a programme.
      throw AppError.badRequest('A template needs at least one question before it can be published');
    }
  }

  doc.status = status;
  await doc.save();

  await audit.record({
    actor,
    action: ACTIONS.SCREENING_TEMPLATE_STATUS_CHANGED,
    targetType: 'ScreeningTemplate',
    targetId: doc._id,
    ctx,
    meta: { status },
  });

  return doc;
}

/**
 * Copy a template, as a fresh draft.
 *
 * WITH NEW KEYS THROUGHOUT, which is the opposite of the rule in `withKeys` and is correct
 * for the same reason. A copy is a different form: if it shared keys with its original, a
 * report that grouped answers by question key would silently pool two different questions
 * that happen to have started from the same wording.
 */
export async function duplicateTemplate(id, actor, ctx = {}) {
  const source = await findTemplateOrFail(id);

  const copy = await ScreeningTemplate.create({
    name: `${source.name} (copy)`,
    description: source.description,
    purpose: source.purpose,
    status: 'DRAFT',
    version: 1,
    sections: withKeys(
      source.sections.map((s) => ({
        ...s.toObject(),
        key: undefined,
        questions: s.questions.map((q) => ({ ...q.toObject(), key: undefined })),
      }))
    ),
    documentTypes: withDocumentKeys(
      source.documentTypes.map((d) => ({ ...d.toObject(), key: undefined }))
    ),
    createdBy: actor._id,
  });

  await audit.record({
    actor,
    action: ACTIONS.SCREENING_TEMPLATE_CREATED,
    targetType: 'ScreeningTemplate',
    targetId: copy._id,
    ctx,
    meta: { name: copy.name, copiedFrom: String(source._id) },
  });

  return copy;
}

async function findTemplateOrFail(id) {
  const doc = await ScreeningTemplate.findOne({ _id: id, deletedAt: null }).exec();
  if (!doc) throw AppError.notFound('Screening template');
  return doc;
}

export async function listTemplates(query = {}) {
  const { page, limit, status, purpose, search } = query;
  const filter = { deletedAt: null };
  if (status) filter.status = status;
  if (purpose) filter.purpose = purpose;
  if (search) filter.name = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

  return paginateQuery(ScreeningTemplate, filter, { page, limit, sort: 'name' });
}

export async function getTemplateById(id) {
  return findTemplateOrFail(id);
}

// --- screenings ---------------------------------------------------------------------------

async function findScreeningOrFail(id) {
  const doc = await Screening.findOne({ _id: id, deletedAt: null }).exec();
  if (!doc) throw AppError.notFound('Screening');
  return doc;
}

/**
 * Begin screening an intake.
 *
 * THE TEMPLATE IS RESOLVED HERE RATHER THAN CHOSEN BY THE CALLER, which is what stops
 * programme-specific forms being hard-coded into screens: name a programme, and the form its
 * administrator attached to it is the one that loads. An explicit template overrides that,
 * for the screening that does not fit any programme.
 *
 * The form is then FROZEN onto the screening — see the note on `form` in the model. From this
 * moment the questions this person was asked cannot change, whatever anybody does to the
 * template afterwards.
 */
export async function startScreening({ intake: intakeId, programme: programmeId, template: templateId }, actor, ctx = {}) {
  const intake = await Intake.findOne({ _id: intakeId, deletedAt: null }).exec();
  if (!intake) throw AppError.notFound('Intake');
  if (intake.status === 'APPROVED') {
    throw AppError.conflict('This intake has already been approved');
  }

  const existing = await Screening.findOne({
    intake: intake._id,
    status: 'IN_PROGRESS',
    deletedAt: null,
  }).exec();
  // Two open screenings for one application means two people asking the same person the same
  // questions and two decisions that can disagree.
  if (existing) return existing;

  const programme = programmeId ?? intake.requestedProgramme ?? null;

  let template = null;
  if (templateId) {
    template = await findTemplateOrFail(templateId);
  } else if (programme) {
    const found = await Programme.findOne({ _id: programme, deletedAt: null })
      .select('screeningTemplate')
      .lean()
      .exec();
    if (found?.screeningTemplate) {
      template = await ScreeningTemplate.findById(found.screeningTemplate).exec();
    }
  }

  if (template && template.status === 'DRAFT') {
    throw AppError.badRequest('That screening template is still a draft and cannot be used yet');
  }

  const doc = await Screening.create({
    intake: intake._id,
    beneficiary: intake.linkedBeneficiary ?? null,
    programme,
    template: template?._id ?? null,
    templateVersion: template?.version ?? null,
    form: template ? template.sections.map((s) => s.toObject()) : [],
    documents: template
      ? template.documentTypes.map((d) => ({ key: d.key, label: d.label, status: 'PENDING' }))
      : [],
    screenedBy: actor._id,
    status: 'IN_PROGRESS',
  });

  intake.status = 'IN_SCREENING';
  await intake.save();

  await audit.record({
    actor,
    action: ACTIONS.SCREENING_STARTED,
    targetType: 'Screening',
    targetId: doc._id,
    ctx,
    meta: { intake: String(intake._id), programme: programme ? String(programme) : null },
  });

  return doc;
}

/**
 * Check one answer against the question it claims to answer.
 *
 * Returns a message, or null when the value is acceptable. The types are checked here rather
 * than in zod because only the frozen form knows what type each question is — a schema
 * cannot know that `q_4f2a` is a date until it has read the screening.
 */
function answerProblem(question, value) {
  if (value === null || value === undefined || value === '') {
    return question.required ? 'This question must be answered' : null;
  }

  switch (question.type) {
    case 'NUMBER':
      return Number.isFinite(Number(value)) ? null : 'Enter a number';
    case 'DATE':
      return Number.isNaN(new Date(value).getTime()) ? 'Enter a valid date' : null;
    case 'YES_NO':
      return typeof value === 'boolean' ? null : 'Answer yes or no';
    case 'CHECKBOX': {
      if (!Array.isArray(value)) return 'Choose any that apply';
      const allowed = new Set(question.options ?? []);
      return value.every((v) => allowed.has(v)) ? null : 'Choose from the options given';
    }
    case 'DROPDOWN':
    case 'MULTIPLE_CHOICE':
      return (question.options ?? []).includes(value) ? null : 'Choose from the options given';
    case 'SHORT_TEXT':
      return String(value).length <= 300 ? null : 'Keep this under 300 characters';
    case 'LONG_TEXT':
      return String(value).length <= 5000 ? null : 'Keep this under 5000 characters';
    default:
      return null;
  }
}

export async function saveAnswers(id, { answers, notes }, actor, ctx = {}) {
  const doc = await findScreeningOrFail(id);
  if (doc.status !== 'IN_PROGRESS') {
    throw AppError.conflict('This screening is closed and its answers cannot be changed');
  }

  const questions = new Map();
  for (const section of doc.form) {
    for (const question of section.questions) questions.set(question.key, question);
  }

  const problems = {};
  const accepted = [];
  for (const { questionKey, value } of answers) {
    const question = questions.get(questionKey);
    // An answer to a question that is not on this screening's frozen form is dropped, not
    // stored: it would be unreadable, since nothing would render it back.
    if (!question) continue;

    const problem = answerProblem(question, value);
    if (problem) problems[questionKey] = problem;
    else accepted.push({ questionKey, value });
  }

  if (Object.keys(problems).length > 0) throw AppError.validationFailed(problems);

  doc.answers = accepted;
  if (notes !== undefined) doc.notes = notes;
  await doc.save();

  await audit.record({
    actor,
    action: ACTIONS.SCREENING_UPDATED,
    targetType: 'Screening',
    targetId: doc._id,
    ctx,
    // The COUNT, never the answers. A screening's answers describe somebody's education,
    // their work history and why they need help; an audit trail is read far more widely than
    // the record it describes, and copying them into it would put them somewhere with looser
    // access than the screening itself.
    meta: { answered: accepted.length },
  });

  return doc;
}

export async function recordDocument(id, entry, actor, ctx = {}) {
  const doc = await findScreeningOrFail(id);
  if (doc.status !== 'IN_PROGRESS') throw AppError.conflict('This screening is closed');

  const row = doc.documents.find((d) => d.key === entry.key);
  if (!row) throw AppError.notFound('Document requirement');

  row.status = entry.status;
  row.document = entry.status === 'UPLOADED' ? (entry.document ?? row.document) : null;
  if (entry.notes !== undefined) row.notes = entry.notes;
  row.recordedBy = actor._id;
  row.recordedAt = new Date();

  await doc.save();

  /*
   * Audited, because "not available" is a finding rather than a blank. If a decision is
   * questioned later — by the applicant, or by somebody reviewing a pattern of refusals —
   * the question is who recorded that the document could not be produced, and when. The
   * note is not copied into the audit entry: it can describe why somebody has no papers.
   */
  await audit.record({
    actor,
    action: ACTIONS.SCREENING_UPDATED,
    targetType: 'Screening',
    targetId: doc._id,
    ctx,
    meta: { document: row.label, status: entry.status },
  });

  return doc;
}

// --- the decision ---------------------------------------------------------------------------

/**
 * Record the decision, and carry out what it means.
 *
 * THIS IS THE ONLY PLACE IN THE SYSTEM THAT TURNS AN APPLICANT INTO A BENEFICIARY, and it is
 * deliberately the only one: the act of creating a register record is authorised by a
 * screening decision, so putting it anywhere else would be a way of registering somebody
 * without one.
 *
 * WHAT EACH DECISION DOES:
 *
 *   ELIGIBLE            links to an existing beneficiary, or creates one. The intake becomes
 *                       APPROVED. Enrolment is NOT automatic — see below.
 *   WAITING_LIST        nothing is created. The applicant stays in the queue, because a
 *                       waiting list is a promise to come back to somebody.
 *   MORE_INFO_REQUIRED  nothing is created, and the screening stays open so the same record
 *                       can be completed rather than started again.
 *   NOT_ELIGIBLE        nothing is created. No register record, which is the entire point.
 *   REFERRED            nothing is created here; the referral module owns what happens next.
 *
 * ENROLMENT IS A SEPARATE ACT. Approving somebody for a programme and putting them in a
 * cohort are different decisions — the cohort may be full, or may not have started — and
 * fusing them would mean an approval silently consuming a seat.
 */
export async function decide(id, { decision, decisionNotes, referredTo }, actor, ctx = {}) {
  const doc = await findScreeningOrFail(id);
  if (doc.status === 'COMPLETED') throw AppError.conflict('This screening already has a decision');

  const intake = await Intake.findById(doc.intake).exec();
  if (!intake) throw AppError.notFound('Intake');

  let beneficiaryId = doc.beneficiary ?? intake.linkedBeneficiary ?? null;

  if (decision === 'ELIGIBLE' && !beneficiaryId) {
    /*
     * WHAT THE REGISTER REQUIRES THAT AN INTAKE DOES NOT.
     *
     * The two forms deliberately disagree. An intake takes whatever a frightened person is
     * willing to say at the door, so date of birth, language and immigration status are all
     * optional there. A register record cannot be served without them — age decides
     * child-protection handling, language decides which WhatsApp prompts they receive and
     * whether an interpreter is needed, and immigration status is the whole subject of the
     * casework.
     *
     * So the gap is closed HERE, at approval, with a message naming exactly what is still
     * needed. The alternative — letting mongoose throw — produces a validation error about
     * `immigration.status` in a screening screen, which tells the officer nothing about what
     * to go and ask.
     */
    const missing = [];
    if (!intake.dateOfBirth) missing.push('a date of birth');
    if (!intake.languages?.length) missing.push('a preferred language');
    if (!intake.immigrationStatus) missing.push('an immigration status');
    if (!intake.nationality) missing.push('a nationality');
    if (!intake.contact?.cellphone) missing.push('a contact number');
    if (missing.length > 0) {
      throw AppError.badRequest(
        `This person cannot be added to the register yet — their intake still needs ${missing.join(', ')}. Complete the intake, then approve.`
      );
    }

    /*
     * The register's own service creates the record, so its rules apply in full: consent
     * before storage, a guardian for a minor, a reference code, the audit entry. Reproducing
     * any of that here would be a second implementation of the invariants that make the
     * register trustworthy.
     */
    const beneficiary = await createBeneficiary(
      {
        firstName: intake.firstName,
        lastName: intake.lastName,
        otherNames: intake.otherNames,
        dateOfBirth: intake.dateOfBirth,
        gender: intake.gender,
        nationality: intake.nationality,
        languages: intake.languages,
        immigration: { status: intake.immigrationStatus },
        contact: intake.contact,
        household: intake.household,
        intakeChannel: intake.channel,
        notes: intake.reasonForVisit,
        consent: {
          given: true,
          method: intake.consent.method,
          givenAt: intake.consent.givenAt,
          policyVersion: intake.consent.policyVersion,
        },
      },
      actor,
      ctx
    );
    beneficiaryId = beneficiary._id;
  }

  doc.decision = decision;
  doc.decisionNotes = decisionNotes ?? '';
  doc.referredTo = referredTo ?? '';
  doc.decidedBy = actor._id;
  doc.decidedAt = new Date();
  doc.beneficiary = beneficiaryId;
  // MORE_INFO leaves the screening open on purpose: the screener is coming back to this same
  // record with the missing answer, not starting a second one.
  doc.status = decision === 'MORE_INFO_REQUIRED' ? 'IN_PROGRESS' : 'COMPLETED';
  doc.completedAt = doc.status === 'COMPLETED' ? new Date() : null;
  await doc.save();

  intake.status =
    decision === 'ELIGIBLE'
      ? 'APPROVED'
      : OPEN_DECISIONS.includes(decision)
        ? decision === 'WAITING_LIST'
          ? 'WAITING_LIST'
          : 'MORE_INFO_REQUIRED'
        : decision === 'REFERRED'
          ? 'REFERRED'
          : 'NOT_ELIGIBLE';
  if (beneficiaryId && !intake.linkedBeneficiary) {
    intake.linkedBeneficiary = beneficiaryId;
    intake.linkedAt = new Date();
  }
  await intake.save();

  await audit.record({
    actor,
    action: ACTIONS.SCREENING_DECIDED,
    targetType: 'Screening',
    targetId: doc._id,
    ctx,
    meta: {
      decision,
      intake: String(intake._id),
      beneficiary: beneficiaryId ? String(beneficiaryId) : null,
    },
  });

  return doc;
}

export async function listScreenings(query = {}) {
  const { page, limit, sort, status, decision, programme, beneficiary, intake } = query;
  const filter = { deletedAt: null };
  if (status) filter.status = status;
  if (decision) filter.decision = decision;
  if (programme) filter.programme = programme;
  if (beneficiary) filter.beneficiary = beneficiary;
  if (intake) filter.intake = intake;

  return paginateQuery(Screening, filter, {
    page,
    limit,
    sort: sort ?? '-startedAt',
    populate: [
      { path: 'intake', select: 'reference firstName lastName source status' },
      { path: 'programme', select: 'name pillar' },
      { path: 'screenedBy', select: 'name role' },
    ],
  });
}

export async function getScreeningById(id) {
  return findScreeningOrFail(id);
}

// --- the public application form ----------------------------------------------------------

/*
 * EVERYTHING BELOW IS SERVED WITHOUT AUTHENTICATION, to somebody deciding whether to apply.
 *
 * The same two rules the public events feed runs under. The query is a hard condition
 * written here, not a filter a caller can influence; and the response is a whitelist, so a
 * field added to a template later is invisible out here until somebody decides otherwise.
 *
 * WHAT A VISITOR MUST NEVER SEE, and why each one is a real risk rather than a tidy-up:
 *
 *   the template's status and version  tells an applicant which form is in flux
 *   `required` on a document type      an applicant who reads "ID required" and has no ID
 *                                      does not apply. The office's whole position is that
 *                                      papers are not a condition of being helped, and the
 *                                      public form must not contradict it
 *   the assessment section             a template may carry the screener's own questions.
 *                                      Those are for staff, and are dropped by name below
 */

/** Sections whose questions are the screener's rather than the applicant's. */
const STAFF_ONLY_SECTION = /^(assessment|decision|staff|office use)/i;

/** The programmes an applicant may apply to, with nothing operational attached. */
export async function listOpenProgrammes() {
  const rows = await Programme.find({
    status: 'ACTIVE',
    deletedAt: null,
    archivedAt: null,
    // Only programmes somebody has actually written a form for. Offering one without a
    // template would take an application nobody can screen.
    screeningTemplate: { $ne: null },
  })
    .select('name description category requirements location screeningTemplate')
    .sort('name')
    .lean()
    .exec();

  return rows.map((row) => ({
    id: String(row._id),
    name: row.name,
    description: row.description ?? '',
    category: row.category ?? '',
    requirements: row.requirements ?? '',
    location: row.location ?? '',
  }));
}

/**
 * The questions attached to a programme, as an applicant should see them.
 *
 * Returns null rather than throwing when a programme has no published form: the public page
 * then collects the ordinary details and nothing more, which is a better answer than an
 * error page for somebody who only wants to ask for help.
 */
export async function getPublicScreeningForm(programmeId) {
  const programme = await Programme.findOne({
    _id: programmeId,
    status: 'ACTIVE',
    deletedAt: null,
  })
    .select('name screeningTemplate')
    .lean()
    .exec();
  if (!programme?.screeningTemplate) return null;

  const template = await ScreeningTemplate.findOne({
    _id: programme.screeningTemplate,
    status: 'PUBLISHED',
    deletedAt: null,
  })
    .lean()
    .exec();
  if (!template) return null;

  return {
    programme: { id: String(programme._id), name: programme.name },
    sections: (template.sections ?? [])
      .filter((section) => !STAFF_ONLY_SECTION.test(section.title ?? ''))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((section) => ({
        key: section.key,
        title: section.title,
        description: section.description ?? '',
        questions: (section.questions ?? [])
          // A file question cannot be answered on this form: uploading from an
          // unauthenticated page would need public write access to storage, and the office
          // takes documents at the desk instead.
          .filter((question) => question.type !== 'FILE')
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
          .map((question) => ({
            key: question.key,
            label: question.label,
            help: question.help ?? '',
            type: question.type,
            required: question.required ?? false,
            ...(question.options?.length ? { options: question.options } : {}),
          })),
      }))
      .filter((section) => section.questions.length > 0),
  };
}

/**
 * A screening the applicant filled in themselves, attached to a new intake.
 *
 * Called only from the public intake path. It records answers and stops: no decision, no
 * beneficiary, no enrolment. What it produces is a screening already populated when a member
 * of staff opens it, which is the whole point — the applicant has answered the questions
 * once, at home, instead of repeating them at a desk.
 */
export async function attachSelfScreening({ intake, programme, answers = [] }) {
  const form = await getPublicScreeningForm(programme);
  if (!form) return null;

  const template = await ScreeningTemplate.findOne({
    _id: (await Programme.findById(programme).select('screeningTemplate').lean()).screeningTemplate,
  }).exec();

  const questions = new Map();
  for (const section of template.sections) {
    for (const question of section.questions) questions.set(question.key, question);
  }

  /*
   * Bad answers are DROPPED, not rejected. A staff-side save refuses the whole set and shows
   * the officer what to fix; there is nobody to show here, and refusing the submission would
   * throw away the application along with the answer. What survives is stored; what does not
   * is a blank the screener asks about.
   */
  const accepted = [];
  for (const { questionKey, value } of answers) {
    const question = questions.get(questionKey);
    if (!question) continue;
    if (answerProblem(question, value) === null && value !== undefined && value !== '') {
      accepted.push({ questionKey, value });
    }
  }

  return Screening.create({
    intake,
    programme,
    template: template._id,
    templateVersion: template.version,
    form: template.sections.map((s) => s.toObject()),
    documents: template.documentTypes.map((d) => ({
      key: d.key,
      label: d.label,
      status: 'PENDING',
    })),
    answers: accepted,
    // Nobody screened this. See the note on the field.
    screenedBy: null,
    selfCompleted: true,
    status: 'IN_PROGRESS',
  });
}
