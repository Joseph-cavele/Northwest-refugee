import { api } from './client';
import type { IsoDate } from '@/types/models';

/*
 * The /reports endpoints, typed.
 *
 * Counts and totals only — nothing here returns a beneficiary, a case or a transaction.
 * See Backend/src/modules/reports/report.routes.js.
 */

/** COUNT is a headcount; CENTS is money and must go through formatZAR, never divided here. */
export type CardUnit = 'COUNT' | 'CENTS';

/**
 * CURRENT is a level right now; MONTH_TO_DATE is a total since the start of the South
 * African calendar month. Sent by the server rather than inferred from the label, so a
 * card can never be captioned as covering a window it does not.
 */
export type CardPeriod = 'CURRENT' | 'MONTH_TO_DATE';

export type CardGroup =
  | 'register'
  | 'casework'
  | 'programmes'
  | 'events'
  | 'finance'
  | 'fundraising';

export interface DashboardCard {
  /** Also a metric key, so a card can be expanded into its stored daily history. */
  key: string;
  /** Sentence case, from the server's metric vocabulary — do not re-word it here. */
  label: string;
  value: number;
  unit: CardUnit;
  group: CardGroup;
  period: CardPeriod;
  /**
   * True when the figure covers only the caller's own caseload rather than the whole
   * organisation. Not derivable from the number, and captioning a coordinator's figure
   * as the organisation's would misstate it — so it is rendered, not ignored.
   */
  scoped: boolean;
}

export interface DashboardCards {
  generatedAt: IsoDate;
  /**
   * Only the cards this user may see. A card they may not is ABSENT, never zero — the
   * server does not send it, and the UI must not invent a zero in its place.
   */
  cards: DashboardCard[];
}

export function getDashboardCards(signal?: AbortSignal): Promise<DashboardCards> {
  return api.get<DashboardCards>('/reports/cards', { signal });
}
