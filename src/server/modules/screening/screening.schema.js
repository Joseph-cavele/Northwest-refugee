import { z } from 'zod';
import { PAGINATION } from '../../config/constants.js';
import {
  CHOICE_TYPES,
  DOCUMENT_STATUS,
  QUESTION_TYPES,
  SCREENING_DECISIONS,
  SCREENING_STATUS,
  TEMPLATE_PURPOSE,
  TEMPLATE_STATUS,
} from './screening.model.js';

const objectId = (label) =>
  z.string({ error: `${label} is required` }).regex(/^[0-9a-fA-F]{24}$/, `Invalid ${label}`);

// --- the template builder --------------------------------------------------------------

/*
 * A question, validated so a builder cannot save a form that will not render.
 *
 * THE TWO RULES THAT ARE NOT OBVIOUS:
 *
 *   A CHOICE QUESTION MUST HAVE OPTIONS. A dropdown with an empty list renders as a control
 *   with nothing in it — the screener cannot answer, and the applicant sits waiting while
 *   somebody works out whether the form is broken or they are.
 *
 *   A NON-CHOICE QUESTION MUST NOT. Options on a date field are silently ignored at render
 *   and then confuse whoever next edits the template into thinking they do something. A
 *   builder that accepts meaningless data teaches the next person that it is meaningful.
 */
const questionSchema = z
  .object({
    /* Absent when adding a question; the service mints one. Present when editing, and then
       it must survive untouched — answers are stored against it. */
    key: z.string().trim().min(1).max(40).optional(),
    label: z.string({ error: 'Every question needs a label' }).trim().min(1).max(300),
    help: z.string().trim().max(500).optional(),
    type: z.enum(QUESTION_TYPES, { error: 'Choose a question type' }),
    required: z.coerce.boolean().default(false),
    options: z.array(z.string().trim().min(1).max(200)).max(50).optional(),
    order: z.coerce.number().int().min(0).optional(),
  })
  .superRefine((data, ctx) => {
    const isChoice = CHOICE_TYPES.includes(data.type);
    if (isChoice && (!data.options || data.options.length === 0)) {
      ctx.addIssue({
        code: 'custom',
        path: ['options'],
        message: 'A dropdown, multiple-choice or checkbox question needs at least one option',
      });
    }
    if (!isChoice && data.options?.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['options'],
        message: `A ${data.type.toLowerCase().replace('_', ' ')} question cannot have options`,
      });
    }
    if (isChoice && data.options) {
      const seen = new Set(data.options.map((o) => o.toLowerCase()));
      if (seen.size !== data.options.length) {
        // Two identical options are indistinguishable once chosen, so the answer cannot be
        // read back to a meaning.
        ctx.addIssue({ code: 'custom', path: ['options'], message: 'Options must be different from each other' });
      }
    }
  });

const sectionSchema = z.object({
  key: z.string().trim().min(1).max(40).optional(),
  title: z.string({ error: 'Every section needs a title' }).trim().min(1).max(200),
  description: z.string().trim().max(500).optional(),
  order: z.coerce.number().int().min(0).optional(),
  questions: z.array(questionSchema).max(100).default([]),
});

const documentTypeSchema = z.object({
  key: z.string().trim().min(1).max(40).optional(),
  label: z.string({ error: 'Every document type needs a label' }).trim().min(1).max(150),
  required: z.coerce.boolean().default(false),
});

export const createTemplateSchema = z.object({
  name: z.string({ error: 'A template name is required' }).trim().min(2).max(150),
  description: z.string().trim().max(1000).optional(),
  purpose: z.enum(TEMPLATE_PURPOSE).default('GENERAL'),
  sections: z.array(sectionSchema).max(30).default([]),
  documentTypes: z.array(documentTypeSchema).max(30).default([]),
});

/*
 * `status` is absent here and moves through its own endpoint, for the same reason an event
 * cannot be published by a PATCH: publishing a template makes it usable for real decisions
 * about real people, which is a different act from correcting a typo in it.
 */
export const updateTemplateSchema = createTemplateSchema.partial().superRefine((data, ctx) => {
  if (Object.keys(data).length === 0) {
    ctx.addIssue({ code: 'custom', message: 'Provide at least one field to update' });
  }
});

export const templateStatusSchema = z.object({
  status: z.enum(TEMPLATE_STATUS, { error: 'Choose a valid template status' }),
});

export const listTemplatesSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(PAGINATION.MAX_LIMIT).default(PAGINATION.DEFAULT_LIMIT),
  status: z.enum(TEMPLATE_STATUS).optional(),
  purpose: z.enum(TEMPLATE_PURPOSE).optional(),
  search: z.string().trim().max(120).optional(),
});

export const templateIdParamSchema = z.object({ id: objectId('template id') });

// --- screenings --------------------------------------------------------------------------

/**
 * Starting a screening against an intake.
 *
 * The template is optional: a screener can begin without one and record notes and a decision,
 * which is the honest path for a walk-in asking for something no template covers. When a
 * programme is named and that programme carries a template, the service loads it — the
 * caller does not have to know which.
 */
export const startScreeningSchema = z.object({
  intake: objectId('intake id'),
  programme: objectId('programme id').nullable().optional(),
  template: objectId('template id').nullable().optional(),
});

/**
 * Answers, sent as a whole set rather than one at a time.
 *
 * A screening form is filled in over minutes, in front of a person, and a per-keystroke
 * endpoint would put a partial record in the database on every pause. The value is `unknown`
 * here because its shape is decided by the question it answers; the service checks each one
 * against the frozen form before writing it, which is the only place that knows the type.
 */
export const saveAnswersSchema = z.object({
  answers: z
    .array(
      z.object({
        questionKey: z.string().trim().min(1).max(40),
        value: z.unknown(),
      })
    )
    .max(300),
  notes: z.string().trim().max(2000).optional(),
});

export const recordDocumentSchema = z.object({
  key: z.string().trim().min(1).max(40),
  status: z.enum(DOCUMENT_STATUS, { error: 'Choose a document status' }),
  document: objectId('document id').nullable().optional(),
  notes: z.string().trim().max(500).optional(),
});

/**
 * The decision, and the fields each one requires.
 *
 * REFERRED NEEDS A DESTINATION. "Referred" with nowhere named is not a referral, it is a
 * person told to go away in a form that reports as though they were helped — and it would
 * count in the referral column of a funder report.
 *
 * NOT_ELIGIBLE NEEDS A REASON, because it is the decision most likely to be questioned later,
 * by the applicant or by somebody reviewing a pattern of them.
 */
export const decisionSchema = z
  .object({
    decision: z.enum(SCREENING_DECISIONS, { error: 'Choose a decision' }),
    decisionNotes: z.string().trim().max(2000).optional(),
    referredTo: z.string().trim().max(300).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.decision === 'REFERRED' && !data.referredTo?.trim()) {
      ctx.addIssue({
        code: 'custom',
        path: ['referredTo'],
        message: 'Name the organisation or programme they are being referred to',
      });
    }
    if (data.decision === 'NOT_ELIGIBLE' && !data.decisionNotes?.trim()) {
      ctx.addIssue({
        code: 'custom',
        path: ['decisionNotes'],
        message: 'Record why this person is not eligible',
      });
    }
  });

export const listScreeningsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(PAGINATION.MAX_LIMIT).default(PAGINATION.DEFAULT_LIMIT),
  status: z.enum(SCREENING_STATUS).optional(),
  decision: z.enum(SCREENING_DECISIONS).optional(),
  programme: objectId('programme id').optional(),
  beneficiary: objectId('beneficiary id').optional(),
  intake: objectId('intake id').optional(),
  sort: z.enum(['startedAt', '-startedAt']).default('-startedAt'),
});

export const screeningIdParamSchema = z.object({ id: objectId('screening id') });
