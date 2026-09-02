import mongoose from 'mongoose';
import { reference } from '../../utils/reference.js';

const { Schema } = mongoose;

/*
 * Screening: the step between somebody asking for help and NWHR taking them on.
 *
 * THE POINT OF THIS MODULE IS THAT AN APPLICANT IS NOT YET A BENEFICIARY. Before it
 * existed, submitting the public form or walking in created a register record on the spot,
 * which meant the register answered "who has asked us for something" rather than "who are
 * we working with" — two different questions that a funder, a caseworker and an auditor all
 * ask separately. A Screening is the recorded act of deciding between them, and its decision
 * is what moves a person from APPLICANT to BENEFICIARY on their existing record.
 *
 * TWO COLLECTIONS HERE:
 *
 *   ScreeningTemplate  the questions to ask, built by an administrator
 *   Screening          one person, screened once, against a frozen copy of a template
 *
 * The frozen copy is not an optimisation — see the note on `form` below. It is what makes a
 * completed screening a record of what was actually asked on the day, rather than a set of
 * answers floating against whatever the template happens to say now.
 */

// --- questions -----------------------------------------------------------------------

export const QUESTION_TYPES = Object.freeze([
  'SHORT_TEXT',
  'LONG_TEXT',
  'NUMBER',
  'DATE',
  'DROPDOWN',
  'MULTIPLE_CHOICE', // one of many
  'CHECKBOX', // any of many
  'YES_NO',
  'FILE',
]);

/** The types whose `options` list is meaningful. Anything else must not carry one. */
export const CHOICE_TYPES = Object.freeze(['DROPDOWN', 'MULTIPLE_CHOICE', 'CHECKBOX']);

const questionSchema = new Schema(
  {
    /*
     * THE STABLE IDENTITY OF A QUESTION, AND THE MOST IMPORTANT FIELD IN THIS FILE.
     *
     * Answers are stored against this key, never against the question's text. The moment a
     * form builder keys answers by label, fixing a typo in "Higest education level" orphans
     * every answer ever given to it — silently, because nothing errors; the answers simply
     * stop matching a question and disappear from the screening they belong to.
     *
     * Generated on insert and never rewritten. Editing a question's wording, type or order
     * leaves the key alone; only deleting the question retires it.
     */
    key: { type: String, required: true },

    label: { type: String, required: true, trim: true, maxlength: 300 },
    /* Shown under the field. For the sentence a screener would otherwise have to say aloud. */
    help: { type: String, trim: true, maxlength: 500, default: '' },

    type: { type: String, enum: QUESTION_TYPES, required: true },

    /*
     * OPTIONAL BY DEFAULT, and that is a policy decision rather than a convenience.
     *
     * People arrive at this office without documents, without an address, and sometimes
     * without a date of birth they are certain of. A required field they cannot answer is a
     * form they cannot submit, which in practice means a person who cannot be screened. Make
     * a question required only when a blank genuinely stops the decision being made.
     */
    required: { type: Boolean, default: false },

    /** Choice types only. Enforced in the schema layer and again by the service. */
    options: { type: [String], default: undefined },

    order: { type: Number, default: 0 },
  },
  { _id: false }
);

const sectionSchema = new Schema(
  {
    key: { type: String, required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 500, default: '' },
    order: { type: Number, default: 0 },
    questions: { type: [questionSchema], default: [] },
  },
  { _id: false }
);

// --- templates -----------------------------------------------------------------------

/*
 * A template that has never been used may be edited freely. One that has is a different
 * thing: past screenings hold their own frozen copy, so editing cannot corrupt them, but a
 * template still in use by an open programme should not change under a screener mid-intake.
 *
 * DRAFT      being built; cannot be attached to a programme or used to screen
 * PUBLISHED  in use
 * ARCHIVED   kept for the screenings that reference it, offered to nobody new
 */
export const TEMPLATE_STATUS = Object.freeze(['DRAFT', 'PUBLISHED', 'ARCHIVED']);

/** What a template is for. A programme template loads automatically when someone applies. */
export const TEMPLATE_PURPOSE = Object.freeze(['PROGRAMME', 'SERVICE', 'GENERAL']);

const templateSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 150 },
    description: { type: String, trim: true, maxlength: 1000, default: '' },
    purpose: { type: String, enum: TEMPLATE_PURPOSE, default: 'GENERAL', index: true },
    status: { type: String, enum: TEMPLATE_STATUS, default: 'DRAFT', index: true },

    /*
     * Bumped every time a PUBLISHED template is edited. A screening records the number it
     * was taken from, so "which version of the form did this person answer" has an answer
     * without diffing two frozen copies.
     */
    version: { type: Number, default: 1, min: 1 },

    sections: { type: [sectionSchema], default: [] },

    /*
     * Document types this screening should ask about, and NONE of them is mandatory by
     * default — see `required` on a question. A screener records what was produced and what
     * was not; "Not available" is a legitimate outcome that must be recordable, because the
     * alternative is a screener inventing a document or abandoning the screening.
     */
    documentTypes: {
      type: [
        new Schema(
          {
            key: { type: String, required: true },
            label: { type: String, required: true, trim: true, maxlength: 150 },
            required: { type: Boolean, default: false },
          },
          { _id: false }
        ),
      ],
      default: [],
    },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true }
);

templateSchema.index({ status: 1, purpose: 1, name: 1 });

// --- screenings ----------------------------------------------------------------------

export const SCREENING_STATUS = Object.freeze(['IN_PROGRESS', 'COMPLETED', 'CANCELLED']);

/*
 * The five outcomes, from the brief, and each one means something different to the person
 * waiting. WAITING_LIST and MORE_INFO are NOT soft refusals — they are open states somebody
 * has to come back to, which is why the reporting counts them apart from NOT_ELIGIBLE.
 */
export const SCREENING_DECISIONS = Object.freeze([
  'ELIGIBLE',
  'WAITING_LIST',
  'MORE_INFO_REQUIRED',
  'NOT_ELIGIBLE',
  'REFERRED',
]);

/** Decisions that leave the applicant waiting on NWHR rather than settled either way. */
export const OPEN_DECISIONS = Object.freeze(['WAITING_LIST', 'MORE_INFO_REQUIRED']);

/*
 * What a screener recorded about one document.
 *
 * `document` is null for every status except UPLOADED — a checklist entry saying "we asked,
 * they do not have it" is as much a part of the record as a file is, and is the ordinary
 * case for people who left home without papers.
 */
export const DOCUMENT_STATUS = Object.freeze([
  'UPLOADED',
  'PENDING',
  'NOT_AVAILABLE',
  'NOT_APPLICABLE',
]);

const screeningDocumentSchema = new Schema(
  {
    key: { type: String, required: true },
    label: { type: String, required: true, trim: true, maxlength: 150 },
    status: { type: String, enum: DOCUMENT_STATUS, default: 'PENDING' },
    /* The stored file, when there is one. Documents live in their own module, with their
       own signed-URL delivery and download auditing; this only points at one. */
    document: { type: Schema.Types.ObjectId, ref: 'Document', default: null },
    notes: { type: String, trim: true, maxlength: 500, default: '' },
    recordedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    recordedAt: { type: Date, default: null },
  },
  { _id: false }
);

const answerSchema = new Schema(
  {
    /** Matches `question.key` in the frozen form. Never the label. */
    questionKey: { type: String, required: true },
    /*
     * Mixed, because the type is decided by the question: a string, a number, a date, a
     * boolean, or an array for CHECKBOX. The service validates each value against the frozen
     * question's type before it is written, so what lands here is always the right shape for
     * the question it answers.
     */
    value: { type: Schema.Types.Mixed, default: null },
  },
  { _id: false }
);

const screeningSchema = new Schema(
  {
    reference: { type: String, unique: true, index: true },

    /*
     * WHAT IS BEING SCREENED, AND WHY THERE ARE TWO REFERENCES RATHER THAN ONE.
     *
     * `intake` is the application. It is required, because a screening is by definition the
     * act of deciding on one — a screening with no intake is a form filled in about nobody.
     *
     * `beneficiary` is null for a first-time applicant and set for somebody already on the
     * register: an existing beneficiary applying for a second programme is screened again,
     * and that screening belongs on their record from the start rather than after a decision.
     * It is also the field an approval fills in, which is what turns an applicant into a
     * beneficiary — see `approve()` in the service.
     *
     * Neither reference copies a name, a date of birth or a phone number. The intake holds
     * the applicant's details until approval; the register holds them afterwards.
     */
    intake: { type: Schema.Types.ObjectId, ref: 'Intake', required: true, index: true },
    beneficiary: { type: Schema.Types.ObjectId, ref: 'Beneficiary', default: null, index: true },

    /** What they are being screened FOR. A programme, or a kind of service, or neither. */
    programme: { type: Schema.Types.ObjectId, ref: 'Programme', default: null, index: true },

    template: { type: Schema.Types.ObjectId, ref: 'ScreeningTemplate', default: null },
    templateVersion: { type: Number, default: null },

    /*
     * A FROZEN COPY OF THE QUESTIONS, TAKEN WHEN THE SCREENING STARTS.
     *
     * Not denormalisation for speed. A completed screening is evidence: it says these
     * questions were put to this person on this date and these were the answers, and a
     * decision was made on that basis. If the questions were read live from the template,
     * an administrator editing the form next month would silently rewrite the history of
     * every screening ever done against it — changing what a person appears to have been
     * asked, and orphaning answers to questions that no longer exist.
     *
     * So the form travels with the screening. The template reference above is kept only to
     * say where it came from.
     */
    form: { type: [sectionSchema], default: [] },

    status: { type: String, enum: SCREENING_STATUS, default: 'IN_PROGRESS', index: true },
    answers: { type: [answerSchema], default: [] },
    documents: { type: [screeningDocumentSchema], default: [] },

    decision: { type: String, enum: SCREENING_DECISIONS, default: null, index: true },
    decisionNotes: { type: String, trim: true, maxlength: 2000, default: '' },
    decidedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    decidedAt: { type: Date, default: null },

    /* Where a REFERRED decision sent them. Free text: most referrals here are to an
       organisation this system has never heard of. */
    referredTo: { type: String, trim: true, maxlength: 300, default: '' },

    notes: { type: String, trim: true, maxlength: 2000, default: '' },

    /*
     * The member of staff who conducted the screening — NULL when the applicant answered the
     * questions themselves on the public form.
     *
     * WHY IT CANNOT SIMPLY BE REQUIRED. A self-completed screening has no screener, and
     * inventing one — the system account, the last admin to log in — would put a named
     * person's name against answers they never heard given. That name is what an audit
     * reads back as "who screened this applicant".
     */
    screenedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },

    /*
     * ANSWERS THE APPLICANT GAVE ABOUT THEMSELVES, UNWITNESSED.
     *
     * The distinction is not bookkeeping. A screener sitting with somebody hears the answer,
     * asks the follow-up, and sees the document; a web form receives typed text from
     * whoever is holding the phone. Both are useful and they are not the same evidence, so
     * the record says which it is and every screen that shows these answers can say so too.
     *
     * A self-completed screening is still DECIDED by a member of staff — `decidedBy` is set
     * from the session that presses the button, and `screening:decide` gates it. The
     * applicant fills in the form; they do not assess themselves.
     */
    selfCompleted: { type: Boolean, default: false },
    startedAt: { type: Date, default: Date.now },
    completedAt: { type: Date, default: null },

    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true }
);

screeningSchema.pre('validate', function assignReference() {
  if (!this.reference) this.reference = reference('SCR');
});

/* The queue screen: what is still open, oldest first — the person waiting longest. */
screeningSchema.index({ status: 1, startedAt: 1 });
screeningSchema.index({ beneficiary: 1, startedAt: -1 });
screeningSchema.index({ decision: 1, decidedAt: -1 });

export const ScreeningTemplate =
  mongoose.models.ScreeningTemplate ?? mongoose.model('ScreeningTemplate', templateSchema);

export const Screening = mongoose.models.Screening ?? mongoose.model('Screening', screeningSchema);

export default Screening;
