import { api } from './client';
import type { Id, IsoDate } from '@/types/models';
import type { Paginated } from '@/types/api';
import type { ProgrammePillar } from '@/types/enums';

/*
 * The /fundraising endpoints, typed.
 *
 * Four models, one flow: Donor → who gives · Campaign → what towards · Pledge → a promise
 * · Donation → money that actually arrived.
 *
 * EVERY AMOUNT IS INTEGER CENTS, as everywhere else. See lib/money.ts.
 *
 * `taxNumber` IS NOT ON THE DONOR TYPE and cannot be. It is select:false server-side and
 * deleted by the model's toJSON on every one of these four models, because its only
 * legitimate use is printing an s18A certificate. Do not add it here hoping it arrives.
 */

export const DONOR_TYPES = [
  'INDIVIDUAL',
  'CORPORATE',
  'TRUST',
  'FOUNDATION',
  'GOVERNMENT',
  'FAITH_BASED',
  'OTHER',
] as const;
export type DonorType = (typeof DONOR_TYPES)[number];

export const DONOR_TYPE_LABELS: Record<DonorType, string> = {
  INDIVIDUAL: 'Individual',
  CORPORATE: 'Corporate',
  TRUST: 'Trust',
  FOUNDATION: 'Foundation',
  GOVERNMENT: 'Government',
  FAITH_BASED: 'Faith-based',
  OTHER: 'Other',
};

export const CAMPAIGN_STATUSES = ['DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED'] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  DRAFT: 'Draft',
  ACTIVE: 'Active',
  PAUSED: 'Paused',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

export const DONATION_STATUSES = ['PENDING', 'SETTLED', 'FAILED', 'REFUNDED'] as const;
export type DonationStatus = (typeof DONATION_STATUSES)[number];

export const DONATION_STATUS_LABELS: Record<DonationStatus, string> = {
  PENDING: 'Pending',
  SETTLED: 'Settled',
  FAILED: 'Failed',
  REFUNDED: 'Refunded',
};

export const DONATION_METHODS = [
  'CASH',
  'EFT',
  'DEBIT_ORDER',
  'CARD',
  'PAYSTACK',
  'IN_KIND',
  'OTHER',
] as const;
export type DonationMethod = (typeof DONATION_METHODS)[number];

export const DONATION_METHOD_LABELS: Record<DonationMethod, string> = {
  CASH: 'Cash',
  EFT: 'EFT',
  DEBIT_ORDER: 'Debit order',
  CARD: 'Card',
  PAYSTACK: 'Paystack',
  IN_KIND: 'In kind',
  OTHER: 'Other',
};

export interface Donor {
  _id: Id;
  reference: string;
  name: string;
  type: DonorType;
  email: string | null;
  phone: string | null;
  /**
   * A donor who asked not to be named publicly. Their record still exists — a receipt and
   * an audit trail are legal obligations — but reporting must not identify them.
   */
  isAnonymous: boolean;
  totalGivenCents: number;
  lastGiftAt: IsoDate | null;
  createdAt: IsoDate;
}

export interface Campaign {
  _id: Id;
  name: string;
  description: string;
  targetCents: number;
  /** Settled donations only. Never written directly by a caller. */
  raisedCents: number;
  startsAt: IsoDate | null;
  endsAt: IsoDate | null;
  status: CampaignStatus;
  featuredImage: string | null;
  pillar: ProgrammePillar | null;
  /** Null for an untargeted campaign — "no target" is not "nothing raised". */
  progressPercent: number | null;
  isOpen: boolean;
  createdAt: IsoDate;
}

export interface Donation {
  _id: Id;
  reference: string;
  /** Null for a genuinely anonymous gift — a cash tin at an event has no donor. */
  donor: Id | null;
  campaign: Id | null;
  pledge: Id | null;
  amountCents: number;
  currency: string;
  method: DonationMethod;
  donationType: 'ONE_TIME' | 'RECURRING';
  status: DonationStatus;
  /** The donor's own words, quoted back on the receipt. Never an internal note. */
  message: string;
  receivedAt: IsoDate;
  settledAt: IsoDate | null;
  refundedAt: IsoDate | null;
  refundReason: string | null;
  /** s18A certificate number, issued only once the donation has settled. */
  receiptNumber: string | null;
  /**
   * When the receipt actually reached the donor. NULL AFTER SETTLEMENT MEANS THE SEND
   * FAILED — settling does not imply sending, and this field is what answers a donor
   * chasing their tax certificate.
   */
  receiptEmailedAt: IsoDate | null;
  isSettled: boolean;
  createdAt: IsoDate;
}

export interface ListCampaignsQuery {
  page?: number;
  limit?: number;
  status?: CampaignStatus;
  pillar?: ProgrammePillar;
  openOnly?: boolean;
  sort?: 'name' | '-name' | '-raisedCents' | '-endsAt';
}

export function listCampaigns(
  query: ListCampaignsQuery = {},
  signal?: AbortSignal
): Promise<Paginated<Campaign>> {
  return api.list<Campaign>('/fundraising/campaigns', {
    query: query as Record<string, string | number | boolean>,
    signal,
  });
}

export interface CampaignTotals {
  campaign: Id;
  targetCents: number;
  raisedCents: number;
  /** Recomputed from the settled donations themselves. */
  actualCents: number;
  /** False when the denormalised counter has drifted — surfacing it is the point. */
  reconciled: boolean;
  donationCount: number;
  progressPercent: number | null;
}

export function getCampaignTotals(id: Id, signal?: AbortSignal): Promise<CampaignTotals> {
  return api.get<CampaignTotals>(`/fundraising/campaigns/${id}/totals`, { signal });
}

export interface ListDonationsQuery {
  page?: number;
  limit?: number;
  donor?: Id;
  campaign?: Id;
  status?: DonationStatus;
  method?: DonationMethod;
  sort?: 'receivedAt' | '-receivedAt' | '-amountCents';
}

export function listDonations(
  query: ListDonationsQuery = {},
  signal?: AbortSignal
): Promise<Paginated<Donation>> {
  return api.list<Donation>('/fundraising/donations', {
    query: query as Record<string, string | number | boolean>,
    signal,
  });
}

/**
 * Send the s18A certificate again.
 *
 * The endpoint someone reaches for when a donation settled but `receiptEmailedAt` stayed
 * null — a mail provider outage, or a donor with no address on file. Safe to repeat: the
 * receipt number was issued at settlement and does not change.
 */
export function resendReceipt(id: Id): Promise<Donation> {
  return api.post<Donation>(`/fundraising/donations/${id}/receipt/resend`);
}

export interface ListDonorsQuery {
  page?: number;
  limit?: number;
  type?: DonorType;
  search?: string;
  sort?: 'name' | '-name' | 'totalGivenCents' | '-totalGivenCents' | '-lastGiftAt';
}

export function listDonors(
  query: ListDonorsQuery = {},
  signal?: AbortSignal
): Promise<Paginated<Donor>> {
  return api.list<Donor>('/fundraising/donors', {
    query: query as Record<string, string | number | boolean>,
    signal,
  });
}
