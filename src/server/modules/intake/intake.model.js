import mongoose from 'mongoose';
import {
  GENDER,
  IMMIGRATION_STATUS,
  INTAKE_CHANNELS,
  SUPPORTED_LANGUAGES,
} from '../../config/constants.js';
import { CONSENT_METHODS } from '../beneficiaries/beneficiary.model.js';
import { reference } from '../../utils/reference.js';

const { Schema } = mongoose;

/*
 * An Intake: somebody has asked NWHR for something, and nobody has decided anything yet.
 *
 * INTAKE IS NOT A BENEFICIARY. That is the rule this collection exists to enforce, and it
 * changes what the register means. Before this, submitting the public form or walking in
 * wrote a row straight into the register with status PENDING_VERIFICATION — so "the
 * register" answered "everyone who has ever asked us for anything", which is a different
 * question from "the people we are working with". A funder asking how many beneficiaries
 * NWHR serves, and a caseworker asking whose files are open, were both being handed the
 * first number.
 *
 * Now: an application lands here. A screening decides. Only an approval creates or links a
 * Beneficiary.
 *
 * WHY THE APPLICANT'S DETAILS LIVE ON THIS RECORD AND NOT ON A STUB BENEFICIARY. They have
 * to live somewhere — you cannot screen a person you have no details for — and putting them
 * on a Beneficiary marked "not really one yet" is what the old design did. The cost is that
 * this collection holds personal information about people who may never become
 * beneficiaries, which is why:
 *
 *   - consent is captured HERE, before anything is written, exactly as it is on the
 *     register. An intake with no consent is not a record to be tidied up later; it is
 *     personal data held without a basis;
 *   - `linkedBeneficiary` means the details on this row are now duplicated on the register.
 *     Once linked, the register is the source of truth and this record is history — nothing
 *     should read contact details from an intake that has been linked;
 *   - a declined intake still has a retention question attached to it. There is no automatic
 *     deletion here yet; see the note at the bottom of this file.
 */

export const INTAKE_SOURCES = Object.freeze(['WALK_IN', 'ONLINE', 'REFERRAL', 'OTHER']);

/*
 * The workflow, as states.
 *
 * PENDING_SCREENING is where everything starts and is the only state the public form can
 * produce. The four settled outcomes mirror the screening decisions, because an intake's
 * state IS the outcome of its screening — kept denormalised here so the queue screen can
 * filter without joining every screening.
 */
export const INTAKE_STATUS = Object.freeze([
  'PENDING_SCREENING',
  'IN_SCREENING',
  'APPROVED', // linked to a beneficiary
  'WAITING_LIST',
  'MORE_INFO_REQUIRED',
  'NOT_ELIGIBLE',
  'REFERRED',
  'WITHDRAWN', // the applicant stopped pursuing it
]);

/** States somebody is still waiting on NWHR for. The queue is built from these. */
export const OPEN_INTAKE_STATUS = Object.freeze([
  'PENDING_SCREENING',
  'IN_SCREENING',
  'WAITING_LIST',
  'MORE_INFO_REQUIRED',
]);

const intakeSchema = new Schema(
  {
    reference: { type: String, unique: true, index: true },

    // --- who ---------------------------------------------------------------------------
    //
    // The minimum needed to screen somebody and, on approval, to open a register record.
    // Deliberately NOT the whole beneficiary shape: no permit number, no vulnerability
    // flags. Both are special personal information that belongs behind the register's own
    // permission and audit rules, and neither is needed to decide whether to take a person
    // on. See the same argument in HelpSteps.tsx about the public form.
    firstName: { type: String, required: true, trim: true, maxlength: 80 },
    lastName: { type: String, required: true, trim: true, maxlength: 80 },
    otherNames: { type: String, trim: true, maxlength: 120, default: '' },
    dateOfBirth: { type: Date, default: null },
    gender: { type: String, enum: GENDER, default: 'UNDISCLOSED' },
    nationality: { type: String, trim: true, maxlength: 60, default: '' },
    languages: { type: [{ type: String, enum: SUPPORTED_LANGUAGES }], default: [] },

    /*
     * Immigration status, and the reason it is optional HERE and required on the register.
     *
     * It is the first thing this organisation needs to know and the last thing a frightened
     * person volunteers to a stranger. An intake form that refuses to save without it turns
     * "I am not sure what my status is" into "we cannot write down that you came in" — so
     * the field waits, and the approval step is where it becomes required, because a
     * register record without it cannot be served.
     */
    immigrationStatus: { type: String, enum: IMMIGRATION_STATUS, default: null },

    contact: {
      cellphone: { type: String, trim: true, default: '' },
      /*
       * `select: false`, matching the register. An email address is the field most likely to
       * be sprayed into a list and mailed, and an applicant has consented to being contacted
       * about their application, not to being on a mailing list.
       */
      email: { type: String, trim: true, lowercase: true, select: false, default: null },
      address: { type: String, trim: true, maxlength: 200, default: '' },
      suburb: { type: String, trim: true, maxlength: 100, default: '' },
    },

    household: {
      size: { type: Number, min: 1, max: 50, default: 1 },
      dependants: { type: Number, min: 0, max: 50, default: 0 },
    },

    // --- what they are asking for --------------------------------------------------------
    reasonForVisit: { type: String, trim: true, maxlength: 2000, default: '' },
    /** Free text when the person does not know the name of what they need, which is usual. */
    requestedSupport: { type: String, trim: true, maxlength: 500, default: '' },
    requestedProgramme: { type: Schema.Types.ObjectId, ref: 'Programme', default: null, index: true },

    // --- provenance ----------------------------------------------------------------------
    source: { type: String, enum: INTAKE_SOURCES, default: 'WALK_IN', index: true },
    /** The register's own vocabulary, kept so an approved intake can set it verbatim. */
    channel: { type: String, enum: INTAKE_CHANNELS, default: 'WALK_IN' },
    referredBy: { type: String, trim: true, maxlength: 200, default: '' },

    /*
     * CONSENT, CAPTURED BEFORE ANY OF THE ABOVE IS STORED — not a checkbox added afterwards.
     * The same rule the register runs under: a record created without a recorded basis is
     * personal data held without one, and the fix is not to add the field later.
     *
     * `given` has no default on purpose. A caller that forgets it fails validation rather
     * than silently recording that somebody agreed to something.
     */
    consent: {
      given: { type: Boolean, required: true },
      /*
       * THE SAME VOCABULARY THE REGISTER USES, and it has to be. On approval this value is
       * copied onto the beneficiary verbatim; a method the register does not recognise makes
       * the approval fail at the last step, after the officer has already told the applicant
       * they are in. Sharing the enum is what makes the handover total.
       */
      method: { type: String, enum: CONSENT_METHODS, required: true },
      givenAt: { type: Date, required: true, default: Date.now },
      policyVersion: { type: String, required: true, default: '1.0' },
    },

    status: { type: String, enum: INTAKE_STATUS, default: 'PENDING_SCREENING', index: true },

    /*
     * The register record this intake produced or was matched to. Null until a screening
     * approves it, or until a screener recognises the applicant as somebody already known —
     * which is the duplicate case, and the reason this is a link rather than a copy.
     */
    linkedBeneficiary: { type: Schema.Types.ObjectId, ref: 'Beneficiary', default: null, index: true },
    linkedAt: { type: Date, default: null },

    notes: { type: String, trim: true, maxlength: 2000, default: '' },

    /** Null for an online application: nobody at NWHR captured it, the applicant did. */
    capturedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    receivedAt: { type: Date, default: Date.now, index: true },

    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true }
);

intakeSchema.pre('validate', function assignReference() {
  if (!this.reference) this.reference = reference('INT');
});

/* The queue: what is open, oldest first — the person who has waited longest is first. */
intakeSchema.index({ status: 1, receivedAt: 1 });
intakeSchema.index({ source: 1, receivedAt: -1 });
/* Duplicate search, and the "have we seen this person" check on a new intake. */
intakeSchema.index({ 'contact.cellphone': 1 });
intakeSchema.index({ lastName: 1, firstName: 1, dateOfBirth: 1 });

intakeSchema.virtual('fullName').get(function fullName() {
  return [this.firstName, this.otherNames, this.lastName].filter(Boolean).join(' ');
});

/*
 * The email is stripped from every JSON response, as on the register — `select: false` keeps
 * it out of ordinary queries, and this keeps it out of a response where somebody explicitly
 * selected it for a legitimate reason and then serialised the document whole.
 */
intakeSchema.set('toJSON', {
  virtuals: true,
  transform(_doc, ret) {
    if (ret.contact) delete ret.contact.email;
    return ret;
  },
});

/*
 * RETENTION IS AN OPEN QUESTION AND IS DELIBERATELY NOT SOLVED HERE.
 *
 * This collection accumulates personal information about people NWHR decided not to take
 * on — the group with the least connection to the organisation and the weakest reason for
 * their details to be kept. POPIA says personal information may not be retained longer than
 * is necessary for the purpose it was collected for.
 *
 * A rule needs a person to set it, not a developer to guess it: how long a declined intake
 * is kept, whether a waiting-list entry expires, and what happens to an intake nobody ever
 * screened. Until that decision exists, nothing here is deleted automatically — a soft
 * `deletedAt` is the only removal, and it is manual.
 */

export const Intake = mongoose.models.Intake ?? mongoose.model('Intake', intakeSchema);

export default Intake;
