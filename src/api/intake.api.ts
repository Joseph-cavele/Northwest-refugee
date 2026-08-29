import { api } from './client';
import type { Gender, ImmigrationStatus, SupportedLanguage } from '@/types/enums';

/*
 * `POST /api/v1/intake` — the public self-registration behind /get-help.
 *
 * THE ONLY UNAUTHENTICATED WRITE THIS APP MAKES. Every other call in src/api goes out with a
 * Bearer token; this one deliberately does not, because the person sending it has no account
 * and the whole point of the route is that they should not need one to ask for help.
 *
 * WHAT IS ABSENT FROM THIS TYPE IS THE INTERESTING PART, and it mirrors `publicIntakeSchema`
 * on the server exactly: no permit number, no vulnerability flags, no programme, no officer,
 * no status, and no intake channel. The server decides the last two and refuses the rest —
 * this type simply makes it impossible to write a caller that tries.
 *
 * `arrivingBy` is what the person SAYS they will do. It is not the intake channel: the server
 * records that as WEB, because that is how the record actually arrived, and files the stated
 * intention in the notes where a caseworker reads it.
 */

export interface IntakeSubmission {
  firstName: string;
  lastName: string;
  otherNames?: string | null;
  gender: Gender;
  /** YYYY-MM-DD. The server parses it at UTC midnight so the date never shifts a day. */
  dateOfBirth: string;
  nationality: string;
  /** First entry is the preferred language — it decides whether an interpreter is needed. */
  languages: SupportedLanguage[];
  immigration: { status: ImmigrationStatus };
  contact: {
    cellphone: string;
    email?: string | null;
    address?: string;
    suburb?: string;
    city?: string;
    province?: string;
  };
  household?: { size?: number };
  guardian?: {
    fullName: string;
    relationship: string;
    phone?: string | null;
  } | null;
  arrivingBy: 'WALK_IN' | 'REFERRAL' | 'WEB' | 'WHATSAPP';
  referredBy?: string;
  notes?: string;
  /** `given` must be true. The server refuses anything else rather than storing a decline. */
  consent: { given: true; policyVersion?: string };
}

/**
 * The response carries a reference code and nothing else — see the route's own note on why
 * echoing the record back over an unauthenticated channel would be a mistake.
 */
export interface IntakeReceipt {
  referenceCode: string;
}

/*
 * `anonymous: true` — no Bearer header and no 401 retry. Not an optimisation: this endpoint
 * has no session to refresh, and a retry loop against a route that writes to the register is
 * the last thing anybody wants.
 */
export function submitIntake(body: IntakeSubmission) {
  return api.post<IntakeReceipt>('/intake', body, { anonymous: true });
}
