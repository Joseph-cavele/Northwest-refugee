import { api } from './client';
import type { Id, IsoDate } from '@/types/models';
import type { BeneficiaryStatus } from '@/types/enums';

/*
 * The /beneficiaries endpoints, typed.
 *
 * THE REGISTER IS THE MOST SENSITIVE COLLECTION IN THIS SYSTEM. The row type below is
 * deliberately narrow: a permit number, an immigration status and a vulnerability flag are
 * `select: false` on the server and reach a client only through
 * `GET /beneficiaries/:id/sensitive`, which needs its own permission and writes an audit
 * entry every time it is used. Do not widen this interface to "save a request".
 */

export interface BeneficiarySummary {
  _id: Id;
  /** What a caseworker quotes down a phone. Never an ID number. */
  referenceCode: string;
  firstName: string;
  lastName: string;
  status: BeneficiaryStatus;
  createdAt: IsoDate;
}

export interface ListBeneficiariesQuery {
  page?: number;
  limit?: number;
  status?: BeneficiaryStatus;
  /**
   * Full-text over first name, last name and reference code — the server holds a text
   * index on exactly those three. It is not a substring match: "Tha" will not find
   * "Thandiwe", but "Thandiwe" and "NWHR-2026-ABC123" both will.
   */
  search?: string;
}

export function listBeneficiaries(
  query: ListBeneficiariesQuery = {},
  signal?: AbortSignal
): Promise<BeneficiarySummary[]> {
  return api.get<BeneficiarySummary[]>('/beneficiaries', {
    query: query as Record<string, string | number | boolean>,
    signal,
  });
}
