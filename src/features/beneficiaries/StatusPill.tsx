import { cn } from '@/lib/utils';
import { BENEFICIARY_STATUS_LABELS } from '@/types/enums';
import type { BeneficiaryStatus } from '@/types/enums';

/*
 * Where a record stands, in one token.
 *
 * Its own module because the register and the record both show it, and a status rendered
 * two different ways on two screens is how a reader learns to distrust both. Colour is a
 * second signal only — the word is always there.
 */

const TONES: Record<BeneficiaryStatus, string> = {
  DRAFT: 'bg-ink-100 text-ink-600',
  PENDING_VERIFICATION: 'bg-accent-50 text-accent-800',
  ACTIVE: 'bg-success-50 text-success-700',
  INACTIVE: 'bg-ink-100 text-ink-600',
  EXITED: 'bg-ink-100 text-ink-600',
  REJECTED: 'bg-danger-50 text-danger-700',
};

export function StatusPill({
  status,
  className,
}: {
  status: BeneficiaryStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-block rounded-full px-2.5 py-1 text-sm font-semibold whitespace-nowrap',
        TONES[status],
        className
      )}
    >
      {BENEFICIARY_STATUS_LABELS[status]}
    </span>
  );
}

export default StatusPill;
