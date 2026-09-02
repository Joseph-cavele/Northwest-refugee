import { api } from './client';
import type { Id, IsoDate } from '@/types/models';
import type { Paginated } from '@/types/api';
import type { IntakeRow } from './intakes.api';

/*
 * Screening: the recorded act of deciding whether NWHR takes somebody on.
 *
 * THE ONE THING TO UNDERSTAND BEFORE USING THIS MODULE. A screening carries its own FROZEN
 * COPY of the questions — `form` — taken when it started. Render from that, never from the
 * template: the template can be edited afterwards, and a screening is evidence of what was
 * actually asked on the day. Answers are keyed by `question.key`, never by the label.
 */

export const QUESTION_TYPES = [
  'SHORT_TEXT',
  'LONG_TEXT',
  'NUMBER',
  'DATE',
  'DROPDOWN',
  'MULTIPLE_CHOICE',
  'CHECKBOX',
  'YES_NO',
  'FILE',
] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  SHORT_TEXT: 'Short text',
  LONG_TEXT: 'Long text',
  NUMBER: 'Number',
  DATE: 'Date',
  DROPDOWN: 'Dropdown',
  MULTIPLE_CHOICE: 'Multiple choice',
  CHECKBOX: 'Checkboxes',
  YES_NO: 'Yes / No',
  FILE: 'File upload',
};

/** The types whose `options` list is meaningful. */
export const CHOICE_TYPES: QuestionType[] = ['DROPDOWN', 'MULTIPLE_CHOICE', 'CHECKBOX'];

export interface ScreeningQuestion {
  key: string;
  label: string;
  help: string;
  type: QuestionType;
  required: boolean;
  options?: string[];
  order: number;
}

export interface ScreeningSection {
  key: string;
  title: string;
  description: string;
  order: number;
  questions: ScreeningQuestion[];
}

export const SCREENING_DECISIONS = [
  'ELIGIBLE',
  'WAITING_LIST',
  'MORE_INFO_REQUIRED',
  'NOT_ELIGIBLE',
  'REFERRED',
] as const;
export type ScreeningDecision = (typeof SCREENING_DECISIONS)[number];

/*
 * The words a screener sees on the buttons. Deliberately plainer than the enum: "Not
 * eligible" is what the system records, "Cannot help with this" is closer to what is being
 * decided, and the second is harder to press without thinking.
 */
export const DECISION_LABELS: Record<ScreeningDecision, string> = {
  ELIGIBLE: 'Approve',
  WAITING_LIST: 'Waiting list',
  MORE_INFO_REQUIRED: 'Need more information',
  NOT_ELIGIBLE: 'Not eligible',
  REFERRED: 'Refer elsewhere',
};

export const DECISION_MEANING: Record<ScreeningDecision, string> = {
  ELIGIBLE: 'Puts them on the register. This is the only decision that does.',
  WAITING_LIST: 'They qualify but there is no place yet. They stay in the queue.',
  MORE_INFO_REQUIRED: 'The screening stays open so you can come back to it.',
  NOT_ELIGIBLE: 'No register record is created. Record why.',
  REFERRED: 'Sent to another organisation or programme. Name where.',
};

export const DOCUMENT_STATUSES = ['UPLOADED', 'PENDING', 'NOT_AVAILABLE', 'NOT_APPLICABLE'] as const;
export type ScreeningDocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const DOCUMENT_STATUS_LABELS: Record<ScreeningDocumentStatus, string> = {
  UPLOADED: 'Provided',
  PENDING: 'Still to bring',
  NOT_AVAILABLE: 'Does not have it',
  NOT_APPLICABLE: 'Does not apply',
};

export interface ScreeningDocument {
  key: string;
  label: string;
  status: ScreeningDocumentStatus;
  document: Id | null;
  notes: string;
  recordedBy: Id | null;
  recordedAt: IsoDate | null;
}

export interface ScreeningAnswer {
  questionKey: string;
  /** Shape is decided by the question it answers — string, number, boolean or string[]. */
  value: unknown;
}

export interface ScreeningRow {
  _id: Id;
  reference: string;
  intake: IntakeRow | Id;
  beneficiary: Id | null;
  programme: { _id: Id; name: string } | Id | null;
  template: Id | null;
  templateVersion: number | null;
  /** The frozen questions. Render from this, never from the template. */
  form: ScreeningSection[];
  status: 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  answers: ScreeningAnswer[];
  documents: ScreeningDocument[];
  decision: ScreeningDecision | null;
  decisionNotes: string;
  decidedBy: Id | null;
  decidedAt: IsoDate | null;
  referredTo: string;
  notes: string;
  screenedBy: { _id: Id; name: string } | Id | null;
  /** True when the applicant answered the questions themselves on the public form. */
  selfCompleted: boolean;
  startedAt: IsoDate;
  completedAt: IsoDate | null;
}

export interface ListScreeningsQuery {
  page?: number;
  limit?: number;
  status?: ScreeningRow['status'];
  decision?: ScreeningDecision;
  programme?: Id;
  beneficiary?: Id;
  intake?: Id;
  sort?: 'startedAt' | '-startedAt';
}

export function listScreenings(
  query: ListScreeningsQuery = {},
  signal?: AbortSignal
): Promise<Paginated<ScreeningRow>> {
  return api.list<ScreeningRow>('/screenings', {
    query: query as Record<string, string | number | boolean>,
    signal,
  });
}

export function getScreening(id: Id, signal?: AbortSignal): Promise<ScreeningRow> {
  return api.get<ScreeningRow>(`/screenings/${id}`, { signal });
}

/**
 * Begin screening an application.
 *
 * The template is resolved from the programme server-side — naming a programme is enough,
 * and the form its administrator attached is the one that loads. Returns the screening
 * already in progress when one exists, rather than starting a second.
 */
export function startScreening(input: {
  intake: Id;
  programme?: Id | null;
  template?: Id | null;
}): Promise<ScreeningRow> {
  return api.post<ScreeningRow>('/screenings', input);
}

/** The whole answer set replaces the whole set — see the route's note on why it is a PUT. */
export function saveAnswers(
  id: Id,
  input: { answers: ScreeningAnswer[]; notes?: string }
): Promise<ScreeningRow> {
  return api.put<ScreeningRow>(`/screenings/${id}/answers`, input);
}

export function recordDocument(
  id: Id,
  input: { key: string; status: ScreeningDocumentStatus; document?: Id | null; notes?: string }
): Promise<ScreeningRow> {
  return api.post<ScreeningRow>(`/screenings/${id}/documents`, input);
}

/**
 * The decision. Needs `screening:decide`, which is NOT `screening:conduct`.
 *
 * ELIGIBLE is the only decision that creates or links a register record, and the server
 * refuses it when the application is still missing what the register requires — it says
 * exactly which fields. Show that message; it is written for the officer reading it.
 */
export function decideScreening(
  id: Id,
  input: { decision: ScreeningDecision; decisionNotes?: string; referredTo?: string }
): Promise<ScreeningRow> {
  return api.post<ScreeningRow>(`/screenings/${id}/decision`, input);
}

/** The populated intake, or null when the server sent a bare id. */
export function intakeOf(screening: ScreeningRow): IntakeRow | null {
  return screening.intake && typeof screening.intake === 'object'
    ? (screening.intake as IntakeRow)
    : null;
}

// --- templates ------------------------------------------------------------------------------

export const TEMPLATE_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;
export type TemplateStatus = (typeof TEMPLATE_STATUSES)[number];

export const TEMPLATE_STATUS_LABELS: Record<TemplateStatus, string> = {
  DRAFT: 'Draft',
  PUBLISHED: 'In use',
  ARCHIVED: 'Archived',
};

export const TEMPLATE_PURPOSES = ['PROGRAMME', 'SERVICE', 'GENERAL'] as const;
export type TemplatePurpose = (typeof TEMPLATE_PURPOSES)[number];

export const TEMPLATE_PURPOSE_LABELS: Record<TemplatePurpose, string> = {
  PROGRAMME: 'For a programme',
  SERVICE: 'For a service',
  GENERAL: 'General',
};

export interface TemplateDocumentType {
  key: string;
  label: string;
  required: boolean;
}

export interface ScreeningTemplateRow {
  _id: Id;
  name: string;
  description: string;
  purpose: TemplatePurpose;
  status: TemplateStatus;
  /** Bumped whenever a published template is edited. Screenings record the number they used. */
  version: number;
  sections: ScreeningSection[];
  documentTypes: TemplateDocumentType[];
  createdBy: Id | null;
  createdAt: IsoDate;
  updatedAt: IsoDate;
}

/*
 * What the builder SENDS. Keys are optional because a new question has none yet — the server
 * mints one.
 *
 * A KEY THAT COMES BACK MUST BE SENT BACK. Answers are stored against it, so dropping the key
 * when saving an existing question orphans every answer ever given to it. Nothing errors; the
 * answers simply stop matching a question. Always round-trip what the server gave you.
 */
export interface QuestionInput {
  key?: string;
  label: string;
  help?: string;
  type: QuestionType;
  required?: boolean;
  options?: string[];
  order?: number;
}

export interface SectionInput {
  key?: string;
  title: string;
  description?: string;
  order?: number;
  questions: QuestionInput[];
}

export interface TemplateInput {
  name: string;
  description?: string;
  purpose?: TemplatePurpose;
  sections?: SectionInput[];
  documentTypes?: { key?: string; label: string; required?: boolean }[];
}

export function listTemplates(
  query: { page?: number; limit?: number; status?: TemplateStatus; purpose?: TemplatePurpose; search?: string } = {},
  signal?: AbortSignal
): Promise<Paginated<ScreeningTemplateRow>> {
  return api.list<ScreeningTemplateRow>('/screening-templates', {
    query: query as Record<string, string | number | boolean>,
    signal,
  });
}

export function getTemplate(id: Id, signal?: AbortSignal): Promise<ScreeningTemplateRow> {
  return api.get<ScreeningTemplateRow>(`/screening-templates/${id}`, { signal });
}

export function createTemplate(input: TemplateInput): Promise<ScreeningTemplateRow> {
  return api.post<ScreeningTemplateRow>('/screening-templates', input);
}

export function updateTemplate(id: Id, input: TemplateInput): Promise<ScreeningTemplateRow> {
  return api.patch<ScreeningTemplateRow>(`/screening-templates/${id}`, input);
}

/** Publish, archive, or send back to draft. Its own act — publishing makes a form usable. */
export function setTemplateStatus(id: Id, status: TemplateStatus): Promise<ScreeningTemplateRow> {
  return api.post<ScreeningTemplateRow>(`/screening-templates/${id}/status`, { status });
}

/** A copy, as a fresh draft, with new keys throughout — see the route's note. */
export function duplicateTemplate(id: Id): Promise<ScreeningTemplateRow> {
  return api.post<ScreeningTemplateRow>(`/screening-templates/${id}/duplicate`, {});
}
