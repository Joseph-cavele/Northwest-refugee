import { z } from 'zod';
import {
  GENDER,
  IMMIGRATION_STATUS,
  PAGINATION,
  SUPPORTED_LANGUAGES,
} from '../../config/constants.js';
import { CONSENT_METHODS } from '../beneficiaries/beneficiary.model.js';
import { INTAKE_SOURCES, INTAKE_STATUS } from './intake.model.js';

/*
 * What may be written to an intake, and by whom.
 *
 * TWO ENTRY POINTS WITH DIFFERENT RIGHTS, which is why there are two create schemas rather
 * than one with a flag:
 *
 *   walkInIntakeSchema  a staff member at the desk, behind `intake:create`
 *   publicIntakeSchema  the applicant themselves, unauthenticated, rate limited
 *
 * THE PUBLIC ONE IS A SUBSET, AND THE DIFFERENCE IS THE POINT. `status`, `linkedBeneficiary`
 * and `capturedBy` are absent from both — the service decides all three — but the public
 * schema additionally refuses `source`, `channel` and `requestedProgramme`, because a field
 * a stranger can set is a field a stranger can use to place themselves in a queue they were
 * not put in. An unknown key is stripped by zod rather than rejected, so a caller adding one
 * gets a saved record without it rather than an error that tells them the field exists.
 */

const objectId = (label) =>
  z.string({ error: `${label} is required` }).regex(/^[0-9a-fA-F]{24}$/, `Invalid ${label}`);

const person = {
  firstName: z.string({ error: 'A first name is required' }).trim().min(1).max(80),
  lastName: z.string({ error: 'A last name is required' }).trim().min(1).max(80),
  otherNames: z.string().trim().max(120).optional(),
  /*
   * OPTIONAL, AND THAT IS DELIBERATE. The register requires a date of birth because a
   * beneficiary's age decides child-protection handling. An applicant at the door may not
   * know theirs, and refusing the intake over it means refusing to record that they asked
   * for help. It becomes required at approval, where the register's own schema enforces it.
   */
  dateOfBirth: z.iso.date({ error: 'Enter a date as YYYY-MM-DD' }).optional(),
  gender: z.enum(GENDER).optional(),
  nationality: z.string().trim().max(60).optional(),
  languages: z.array(z.enum(SUPPORTED_LANGUAGES)).max(4).optional(),
  immigrationStatus: z.enum(IMMIGRATION_STATUS).nullable().optional(),
  contact: z
    .object({
      cellphone: z.string().trim().max(20).optional(),
      email: z.email({ error: 'Enter a valid email address' }).optional(),
      address: z.string().trim().max(200).optional(),
      suburb: z.string().trim().max(100).optional(),
    })
    .optional(),
  household: z
    .object({
      size: z.coerce.number().int().min(1).max(50).optional(),
      dependants: z.coerce.number().int().min(0).max(50).optional(),
    })
    .optional(),
  reasonForVisit: z.string().trim().max(2000).optional(),
  requestedSupport: z.string().trim().max(500).optional(),
};

/*
 * Consent, as a required object with no default on `given`.
 *
 * A schema that defaulted this to true would record that every applicant agreed to
 * something, which is worse than not recording it at all: it manufactures the evidence that
 * the organisation would later rely on.
 */
const consent = z.object({
  given: z.literal(true, { error: 'The applicant must agree before anything is recorded' }),
  method: z.enum(CONSENT_METHODS, { error: 'Record how consent was given' }),
  policyVersion: z.string().trim().max(20).optional(),
});

export const walkInIntakeSchema = z.object({
  ...person,
  source: z.enum(INTAKE_SOURCES).default('WALK_IN'),
  referredBy: z.string().trim().max(200).optional(),
  requestedProgramme: objectId('programme id').nullable().optional(),
  notes: z.string().trim().max(2000).optional(),
  consent,
});

/*
 * The public form at /get-help.
 *
 * ITS SHAPE IS THE ONE THE LIVE FORM ALREADY SENDS, and that is a constraint rather than a
 * preference. `HelpSteps.tsx` has been posting this body since the page was built; changing
 * the contract to something tidier would break the only route a person in trouble can use,
 * for the benefit of nobody. So:
 *
 *   immigration  arrives NESTED, as `{ status }`, because that is the register's shape and
 *                the form was written against it. Flattened to `immigrationStatus` below,
 *                so everything downstream sees one field.
 *   arrivingBy   still accepts WEB and WHATSAPP. They are how somebody describes reaching
 *                us, not a source this schema is allowed to set.
 *   consent      carries no `method`. A visitor cannot assert HOW they consented — they
 *                ticked a box on a web form — so the service records ONLINE_FORM and the
 *                schema does not invite the caller to claim otherwise.
 */
export const publicIntakeSchema = z
  .object({
    ...person,
    /* The register's nested shape, kept for compatibility and flattened by the transform. */
    immigration: z.object({ status: z.enum(IMMIGRATION_STATUS) }).optional(),
    arrivingBy: z.enum(['WALK_IN', 'REFERRAL', 'WEB', 'WHATSAPP', 'OTHER']).default('WEB'),
    /*
     * The programme applied for, and the answers to ITS screening questions.
     *
     * Both optional: somebody who does not know what they need can still apply, and gets the
     * ordinary intake with no form attached. `answers` is unvalidated here on purpose — the
     * types belong to the template, so the screening service checks each value against the
     * question it answers and drops what does not fit rather than refusing the application.
     */
    requestedProgramme: objectId('programme id').optional(),
    answers: z
      .array(z.object({ questionKey: z.string().trim().min(1).max(40), value: z.unknown() }))
      .max(300)
      .optional(),
    referredBy: z.string().trim().max(200).optional(),
    notes: z.string().trim().max(2000).optional(),
    consent: z.object({
      given: z.literal(true, { error: 'Consent must be given before anything is recorded' }),
      policyVersion: z.string().trim().max(20).optional(),
    }),
  })
  .transform(({ immigration, ...rest }) => ({
    ...rest,
    // One field downstream, whichever way it arrived.
    immigrationStatus: rest.immigrationStatus ?? immigration?.status ?? null,
  }));

export const updateIntakeSchema = z
  .object({
    ...person,
    referredBy: z.string().trim().max(200).optional(),
    requestedProgramme: objectId('programme id').nullable().optional(),
    notes: z.string().trim().max(2000).optional(),
  })
  .partial()
  .superRefine((data, ctx) => {
    if (Object.keys(data).length === 0) {
      ctx.addIssue({ code: 'custom', message: 'Provide at least one field to update' });
    }
  });

export const listIntakesSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(PAGINATION.MAX_LIMIT).default(PAGINATION.DEFAULT_LIMIT),
  status: z.enum(INTAKE_STATUS).optional(),
  source: z.enum(INTAKE_SOURCES).optional(),
  /* The queue tab: everything still waiting on NWHR, whatever its particular state. */
  openOnly: z.coerce.boolean().default(false),
  search: z.string().trim().max(120).optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  sort: z.enum(['receivedAt', '-receivedAt']).default('-receivedAt'),
});

export const intakeIdParamSchema = z.object({ id: objectId('intake id') });

/**
 * Linking an intake to somebody already on the register.
 *
 * `confirmed` is not ceremony. The duplicate search returns candidates, not certainties —
 * two people can share a surname and a birthday — so the officer states that they have
 * looked at the record and it is the same human being. The service records who confirmed it.
 */
export const linkIntakeSchema = z.object({
  beneficiary: objectId('beneficiary id'),
  confirmed: z.literal(true, { error: 'Confirm this is the same person before linking' }),
});
