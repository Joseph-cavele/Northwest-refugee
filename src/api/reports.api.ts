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

// --- the stored daily series --------------------------------------------------------

/**
 * STOCK is a level at a moment ("open cases"); FLOW is an amount over a period ("cases
 * closed"). A chart must never sum a stock across days — three days of twelve open cases is
 * twelve cases, not thirty-six — which is why the server sends `kind` on every row.
 */
export type MetricKind = 'STOCK' | 'FLOW';

export interface MetricRow {
  _id: string;
  /** SAST midnight for the day being described. */
  date: string;
  key: string;
  dimension: string | null;
  dimensionValue: string | null;
  value: number;
  unit: CardUnit;
  kind: MetricKind;
}

export interface MetricQuery {
  /** One key or several — several draws several lines. */
  key?: string | string[];
  /** Omit for the organisation-wide rows only; a breakdown is a separate request. */
  dimension?: 'pillar';
  from?: string;
  to?: string;
  limit?: number;
}

/**
 * Read the stored series, oldest first.
 *
 * Behind `metric:read`, which is NARROWER than the `report:read` behind the cards — the
 * series is organisation-wide, so a programme-scoped role would be reading totals covering
 * programmes they are not on. Callers must check `can(PERMISSIONS.METRIC_READ)` before
 * asking, or they earn a 403.
 */
export function getMetrics(query: MetricQuery, signal?: AbortSignal): Promise<MetricRow[]> {
  const { key, ...rest } = query;
  // The client serialises a repeated key as `?key=a&key=b`, which the server keeps as an
  // array. Joining them into one comma-separated value would be rejected by the enum.
  const search = new URLSearchParams();
  for (const [name, value] of Object.entries(rest)) {
    if (value !== undefined && value !== null && value !== '') search.append(name, String(value));
  }
  for (const k of Array.isArray(key) ? key : key ? [key] : []) search.append('key', k);

  // The query is built by hand rather than passed as `query`, because the client's
  // serialiser takes a flat record and cannot express a repeated key. The signal still
  // matters — this fires on every change of the chart's measure.
  return api.get<MetricRow[]>(`/reports/metrics?${search.toString()}`, { signal });
}
