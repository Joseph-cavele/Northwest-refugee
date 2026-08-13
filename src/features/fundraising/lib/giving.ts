/*
 * What a gift actually is, and how a campaign is actually doing.
 *
 * TWO RULES, BOTH OF WHICH LOOK FINE ON SCREEN WHEN THEY ARE WRONG.
 *
 * ONLY A SETTLED DONATION IS MONEY. `COUNTS_TOWARDS_TOTALS` on the server is exactly
 * ['SETTLED'] — a PENDING gift is a gateway's promise, not funds in the account, and a
 * campaign bar that counts it overstates what NWHR can spend. The overstatement is
 * invisible: the bar looks healthy and the bank does not agree with it.
 *
 * A SETTLED DONATION WITH NO `receiptEmailedAt` IS A DONOR OWED A TAX CERTIFICATE. The
 * service says so outright: the send is best-effort so a mail outage cannot undo banked
 * money, and "receiptEmailedAt is what answers 'did they get their receipt?'". Settling
 * does not imply sending. Nobody finds these by scrolling a donations table — a donor
 * discovers it in February when they file, which is the worst possible way to learn.
 */

export type DonationStanding =
  /** Not money yet. Counts towards nothing. */
  | { kind: 'PENDING' }
  | { kind: 'FAILED' }
  | { kind: 'REFUNDED' }
  /** Banked, and the s18A certificate reached the donor. */
  | { kind: 'RECEIPTED'; sentAt: string }
  /** Banked, but the certificate did not go out. Someone is owed one. */
  | { kind: 'RECEIPT_OWED' };

export function describeDonation({
  status,
  receiptEmailedAt,
}: {
  status: string;
  receiptEmailedAt: string | null;
}): DonationStanding {
  if (status === 'REFUNDED') return { kind: 'REFUNDED' };
  if (status === 'FAILED') return { kind: 'FAILED' };
  if (status !== 'SETTLED') return { kind: 'PENDING' };

  // Settled. The only remaining question is whether the donor actually has their receipt.
  return receiptEmailedAt ? { kind: 'RECEIPTED', sentAt: receiptEmailedAt } : { kind: 'RECEIPT_OWED' };
}

/** True where a donation contributes to a campaign total or a donor's giving history. */
export function countsTowardsTotals(status: string): boolean {
  return status === 'SETTLED';
}

export type CampaignStanding =
  /**
   * No target set. Deliberately NOT zero progress — "no target" is not "nothing raised",
   * which is why the server's progressPercent virtual returns null rather than 0.
   */
  | { kind: 'NO_TARGET'; raisedCents: number }
  | { kind: 'RAISING'; raisedCents: number; targetCents: number; percent: number; remainingCents: number }
  | { kind: 'REACHED'; raisedCents: number; targetCents: number; percent: number }
  | { kind: 'EXCEEDED'; raisedCents: number; targetCents: number; percent: number; overCents: number };

export function describeCampaign({
  raisedCents,
  targetCents,
}: {
  /** Settled donations only — the server maintains it from COUNTS_TOWARDS_TOTALS. */
  raisedCents: number;
  targetCents: number;
}): CampaignStanding {
  const raised = Number.isFinite(raisedCents) && raisedCents > 0 ? Math.floor(raisedCents) : 0;

  if (!Number.isFinite(targetCents) || targetCents <= 0) {
    return { kind: 'NO_TARGET', raisedCents: raised };
  }

  const target = Math.floor(targetCents);
  /*
   * NOT CLAMPED. A campaign that raised 140% of its target should say so — that is the
   * best news the screen has, and pinning it at 100% throws it away. Only the bar's WIDTH
   * is clamped, by the component, because a bar cannot overflow its track.
   */
  const percent = Math.round((raised / target) * 100);

  if (raised > target) {
    return { kind: 'EXCEEDED', raisedCents: raised, targetCents: target, percent, overCents: raised - target };
  }
  if (raised === target) return { kind: 'REACHED', raisedCents: raised, targetCents: target, percent };
  return { kind: 'RAISING', raisedCents: raised, targetCents: target, percent, remainingCents: target - raised };
}
