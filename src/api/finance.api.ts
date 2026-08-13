import { api } from './client';
import type { Id, IsoDate } from '@/types/models';
import type { Paginated } from '@/types/api';

/*
 * The /finance endpoints, typed.
 *
 * MONEY IS INTEGER CENTS. Every field carrying an amount ends in `Cents`, and nothing in
 * this client does arithmetic on rands — see lib/money.ts for why, and for the parse and
 * format helpers that are the only sanctioned crossing points.
 *
 * AMOUNTS ARE ALWAYS POSITIVE. Direction is carried by `type`, never by the sign. A
 * negative amount is how a ledger ends up with two ways to say the same thing and then
 * with totals that depend on which one a query happened to use. Do not add a signed
 * helper here.
 *
 * The request bodies take RANDS AS A STRING (`"1250.00"`), which the server converts with
 * toCents() immediately. Send centsToInput(), never toRands() — `1.005` as a JS number has
 * already lost the third decimal before any code sees it.
 */

export const TRANSACTION_TYPES = ['EXPENSE', 'INCOME', 'TRANSFER', 'REVERSAL'] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  EXPENSE: 'Expense',
  INCOME: 'Income',
  TRANSFER: 'Transfer',
  REVERSAL: 'Reversal',
};

export const TRANSACTION_STATUSES = [
  'DRAFT',
  'PENDING_APPROVAL',
  'APPROVED',
  'REJECTED',
  'REVERSED',
] as const;
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];

export const TRANSACTION_STATUS_LABELS: Record<TransactionStatus, string> = {
  DRAFT: 'Draft',
  PENDING_APPROVAL: 'Awaiting approval',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  REVERSED: 'Reversed',
};

/** Approval posts the entry. From here it is part of the record and cannot be edited. */
export const POSTED_STATUSES: readonly TransactionStatus[] = ['APPROVED', 'REVERSED'];

export const PAYMENT_METHODS = [
  'EFT',
  'CASH',
  'CARD',
  'DEBIT_ORDER',
  'PETTY_CASH',
  'JOURNAL',
  'OTHER',
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  EFT: 'EFT',
  CASH: 'Cash',
  CARD: 'Card',
  DEBIT_ORDER: 'Debit order',
  PETTY_CASH: 'Petty cash',
  JOURNAL: 'Journal',
  OTHER: 'Other',
};

export interface Transaction {
  _id: Id;
  reference: string;
  type: TransactionType;
  /** Positive, always. */
  amountCents: number;
  currency: string;
  description: string;
  payee: string;
  method: PaymentMethod;
  budget: Id | null;
  budgetLineCode: string | null;
  status: TransactionStatus;
  /** What maker-checker compares the approver against. */
  createdBy: Id | null;
  submittedAt: IsoDate | null;
  approvedBy: Id | null;
  approvedAt: IsoDate | null;
  postedAt: IsoDate | null;
  rejectedBy: Id | null;
  rejectedAt: IsoDate | null;
  rejectionReason: string | null;
  /** A reversal points at what it corrects; the original points back. Neither is edited. */
  reversalOf: Id | null;
  reversedBy: Id | null;
  reversalReason: string | null;
  notes: string;
  isPosted: boolean;
  isEditable: boolean;
  createdAt: IsoDate;
}

export interface ListTransactionsQuery {
  page?: number;
  limit?: number;
  type?: TransactionType;
  status?: TransactionStatus;
  budget?: Id;
  budgetLineCode?: string;
  createdBy?: Id;
  /** Everything waiting on someone else — the approver's queue. */
  awaitingApproval?: boolean;
  sort?: 'createdAt' | '-createdAt' | '-amountCents';
}

export function listTransactions(
  query: ListTransactionsQuery = {},
  signal?: AbortSignal
): Promise<Paginated<Transaction>> {
  return api.list<Transaction>('/finance/transactions', {
    query: query as Record<string, string | number | boolean>,
    signal,
  });
}

/**
 * Approve and post.
 *
 * The server refuses this with SELF_APPROVAL when the caller created the record, and with
 * FORBIDDEN naming the delegated limit when the amount is above their ceiling. Both are
 * predicted client-side by lib/approval.ts so the button is not offered in the first place
 * — but the server is the control, and a 403 here is a correct outcome, not a bug.
 */
export function approveTransaction(id: Id): Promise<Transaction> {
  return api.post<Transaction>(`/finance/transactions/${id}/approve`);
}

export function rejectTransaction(id: Id, reason: string): Promise<Transaction> {
  return api.post<Transaction>(`/finance/transactions/${id}/reject`, { reason });
}

export function submitTransaction(id: Id): Promise<Transaction> {
  return api.post<Transaction>(`/finance/transactions/${id}/submit`);
}

/**
 * Correct a posted entry by writing an opposing REVERSAL — never by editing it.
 *
 * The original stays exactly as posted and gains only a back-reference; the pair is the
 * correction. Anyone reading the ledger later sees both the mistake and the fix, which is
 * the only version an auditor can rely on. Returns both rows.
 */
export function reverseTransaction(
  id: Id,
  reason: string
): Promise<{ original: Transaction; reversal: Transaction }> {
  return api.post<{ original: Transaction; reversal: Transaction }>(
    `/finance/transactions/${id}/reverse`,
    { reason }
  );
}

// --- budgets ---------------------------------------------------------------------------

export const BUDGET_STATUSES = [
  'DRAFT',
  'PENDING_APPROVAL',
  'APPROVED',
  'REJECTED',
  'CLOSED',
] as const;
export type BudgetStatus = (typeof BUDGET_STATUSES)[number];

export const BUDGET_STATUS_LABELS: Record<BudgetStatus, string> = {
  DRAFT: 'Draft',
  PENDING_APPROVAL: 'Awaiting approval',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  CLOSED: 'Closed',
};

export interface BudgetLine {
  code: string;
  description: string;
  allocatedCents: number;
  /** Approved in principle, not yet paid. */
  committedCents: number;
  /** Approved and posted. */
  spentCents: number;
  /** allocated − committed − spent. Negative means the line is overspent. */
  availableCents: number;
}

export interface Budget {
  _id: Id;
  reference: string;
  name: string;
  financialYear: number;
  status: BudgetStatus;
  lines: BudgetLine[];
  totalAllocatedCents: number;
  totalCommittedCents: number;
  totalSpentCents: number;
  totalAvailableCents: number;
  isLive: boolean;
  createdAt: IsoDate;
}

export interface ListBudgetsQuery {
  page?: number;
  limit?: number;
  financialYear?: number;
  status?: BudgetStatus;
  sort?: 'name' | '-name' | '-financialYear' | '-createdAt';
}

export function listBudgets(
  query: ListBudgetsQuery = {},
  signal?: AbortSignal
): Promise<Paginated<Budget>> {
  return api.list<Budget>('/finance/budgets', {
    query: query as Record<string, string | number | boolean>,
    signal,
  });
}

export interface BudgetPositionLine extends BudgetLine {
  /** Recomputed from the posted EXPENSE entries themselves. */
  actualCents: number;
  /**
   * False when the running `spentCents` has drifted from the posted entries. Not cosmetic:
   * the two are maintained by different paths, and a mismatch means one of them is wrong.
   */
  reconciled: boolean;
}

export interface BudgetPosition {
  budget: Id;
  reference: string;
  status: BudgetStatus;
  totalAllocatedCents: number;
  totalCommittedCents: number;
  totalSpentCents: number;
  totalAvailableCents: number;
  lines: BudgetPositionLine[];
}

/** Allocation against commitment and spend, line by line, checked against the ledger. */
export function getBudgetPosition(id: Id, signal?: AbortSignal): Promise<BudgetPosition> {
  return api.get<BudgetPosition>(`/finance/budgets/${id}/position`, { signal });
}
