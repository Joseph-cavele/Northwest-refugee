import { api } from './client';
import type { Id, IsoDate } from '@/types/models';
import type { Paginated } from '@/types/api';
import type {
  BeneficiaryStatus,
  ConsentMethod,
  Gender,
  ImmigrationStatus,
  IntakeChannel,
  SupportedLanguage,
  VulnerabilityFlag,
} from '@/types/enums';

/*
 * The /beneficiaries endpoints, typed.
 *
 * THE REGISTER IS THE MOST SENSITIVE COLLECTION IN THIS SYSTEM.
 *
 * The model's toJSON strips the permit number, its blind index and the vulnerability flags
 * before anything leaves the server — verified against the live response, not assumed —
 * and they only ever arrive through `GET /beneficiaries/:id/sensitive`, which needs its own
 * permission and writes an audit entry every single time it is used.
 *
 * WHAT THE LIST STILL CARRIES, AND WHAT A LIST SCREEN SHOULD THEREFORE NOT PRINT. The
 * payload includes date of birth, cellphone, household, guardian and free-text notes. All
 * of those are legitimately readable by a holder of beneficiary:read, and none of them
 * belongs in a table that fills a monitor at a front desk. The row type below is
 * deliberately narrower than the response: it names what a register screen may render, and
 * `age`/`dateOfBirth`/`contact` are left off it on purpose so reaching for them is a
 * deliberate act rather than an autocomplete.
 */

export interface BeneficiaryRow {
  _id: Id;
  /** What a caseworker quotes down a phone. Never an ID number. */
  referenceCode: string;
  firstName: string;
  lastName: string;
  fullName: string;
  status: BeneficiaryStatus;
  gender: Gender;
  nationality: string;
  intakeChannel: IntakeChannel;
  /**
   * Derived server-side from the date of birth, which is why the date itself is not on this
   * type. A child-protection flag is the thing a register must not bury; a birthday is not.
   */
  isMinor: boolean | null;
  immigration: {
    status: ImmigrationStatus;
    /** Drives the expiry queue. A date carries none of the permit's identifying content. */
    permitExpiresAt: IsoDate | null;
  };
  /** Server-computed: true once the expiry date has passed. */
  permitExpired: boolean | null;
  createdAt: IsoDate;
}

export interface ListBeneficiariesQuery {
  page?: number;
  limit?: number;
  /**
   * Full-text over first name, last name and reference code — the server holds a text index
   * on exactly those three. Not a substring match: "Thandiwe" finds her, "Tha" does not.
   */
  search?: string;
  status?: BeneficiaryStatus;
  immigrationStatus?: ImmigrationStatus;
  nationality?: string;
  intakeChannel?: IntakeChannel;
  /** "Whose permit lapses in the next N days" — the queue the expiry job works from. */
  permitExpiringWithinDays?: number;
  sort?: 'createdAt' | '-createdAt' | 'lastName' | '-lastName';
}

/**
 * A page of the register, with the totals a pager needs.
 *
 * Rows are already scoped server-side: a volunteer sees only people they captured, a
 * coordinator only their programmes, and anything out of scope is absent rather than
 * refused — so a count here is a count of what this user may see, never the organisation's.
 */
export function listBeneficiaries(
  query: ListBeneficiariesQuery = {},
  signal?: AbortSignal
): Promise<Paginated<BeneficiaryRow>> {
  return api.list<BeneficiaryRow>('/beneficiaries', {
    query: query as Record<string, string | number | boolean>,
    signal,
  });
}

/*
 * --- one record ---------------------------------------------------------------------
 *
 * Everything the row type leaves off, because a record is a thing someone opened on
 * purpose rather than a table filling a monitor. Still not everything the collection
 * holds: the permit number, the vulnerability flags and the email address are select:false
 * on the server and stripped again by the model's toJSON, so they cannot appear here
 * however this type is written. They arrive only through `readSensitive` below.
 */

export interface Guardian {
  fullName: string;
  relationship: string;
  phone: string;
  /** False where a child arrived unaccompanied and the guardian is a placement, not kin. */
  isLegalGuardian: boolean;
}

/**
 * POPIA's first question about any record here, and the one an auditor asks first:
 * consent was captured BEFORE anything was stored. Withdrawal does not delete the
 * record — retention may be required — but it must stop further processing.
 */
export interface Consent {
  given: boolean;
  givenAt: IsoDate;
  method: ConsentMethod;
  /** Which wording was agreed to. Without it, a later edit makes past consent unprovable. */
  policyVersion: string;
  withdrawnAt: IsoDate | null;
  witnessedBy: Id | null;
}

export interface BeneficiaryRecord {
  _id: Id;
  referenceCode: string;
  firstName: string;
  lastName: string;
  otherNames: string | null;
  fullName: string;
  gender: Gender;
  dateOfBirth: IsoDate;
  age: number | null;
  isMinor: boolean | null;
  nationality: string;
  /** First entry is the preferred language — it decides whether an interpreter is needed. */
  languages: SupportedLanguage[];

  immigration: {
    status: ImmigrationStatus;
    permitType: string | null;
    permitIssuedAt: IsoDate | null;
    permitExpiresAt: IsoDate | null;
  };
  permitExpired: boolean | null;

  contact: {
    cellphone: string;
    address: string;
    suburb: string;
    city: string;
    province: string;
  };

  household: { size: number; headOfHousehold: boolean; dependants: number };
  guardian: Guardian | null;
  consent: Consent;

  intakeChannel: IntakeChannel;
  status: BeneficiaryStatus;
  exitReason: string | null;
  exitAt: IsoDate | null;

  /*
   * Bare ids. This endpoint does not populate them, so there is no name to render — see
   * the note in BeneficiaryRecord.tsx about why the screen shows none of these as people.
   */
  programmes: Id[];
  assignedOfficer: Id | null;
  capturedBy: Id | null;
  verifiedBy: Id | null;
  verifiedAt: IsoDate | null;

  notes: string;
  createdAt: IsoDate;
  updatedAt: IsoDate;
}

/** 404 rather than 403 when the record is out of scope: a 403 confirms the person exists. */
export function getBeneficiary(id: Id, signal?: AbortSignal): Promise<BeneficiaryRecord> {
  return api.get<BeneficiaryRecord>(`/beneficiaries/${id}`, { signal });
}

// --- the sensitive fields ------------------------------------------------------------

/**
 * What comes back from `GET /beneficiaries/:id/sensitive`.
 *
 * THIS CALL IS NOT FREE AND MUST NOT BE MADE ON PAGE LOAD. It needs
 * beneficiary:read_sensitive and the service writes a SENSITIVE_READ audit entry every
 * single time, naming the reader and the fields. That trace is the control: it is what
 * lets NWHR answer "who looked at this person's permit number, and why". Firing it
 * automatically would fill the audit log with reads nobody performed and make the real
 * ones impossible to find. It belongs behind a deliberate action — see SensitivePanel.
 */
export interface SensitiveDisclosure {
  id: Id;
  referenceCode: string;
  /** Null when the record has no permit number, or when decryption failed. */
  permitNumber: string | null;
  /**
   * True when the ciphertext could not be read — a missing or rotated ENCRYPTION_KEY.
   * Surfaced as its own flag rather than a 500, because "we cannot decrypt this" and
   * "this person has no permit" are different facts and only one of them is about them.
   */
  permitDecryptionFailed: boolean;
  vulnerabilityFlags: VulnerabilityFlag[];
  email: string | null;
}

/**
 * @param reason Free text, capped at 200 by the server, written into the audit entry.
 *   Optional to the API. The panel asks for it anyway — an audit trail of reads with no
 *   stated purpose answers "who" but never "why", which is the half that matters.
 */
export function readSensitive(id: Id, reason?: string): Promise<SensitiveDisclosure> {
  return api.get<SensitiveDisclosure>(`/beneficiaries/${id}/sensitive`, {
    query: reason ? { reason } : undefined,
  });
}

// --- verification --------------------------------------------------------------------

export interface VerifyBeneficiaryInput {
  verified: boolean;
  /** Required by the server when rejecting: "rejected" with no reason is unactionable. */
  reason?: string;
}

/** Moves the record to ACTIVE or REJECTED and stamps the verifier. Audited either way. */
export function verifyBeneficiary(
  id: Id,
  input: VerifyBeneficiaryInput
): Promise<BeneficiaryRecord> {
  return api.post<BeneficiaryRecord>(`/beneficiaries/${id}/verify`, input);
}
