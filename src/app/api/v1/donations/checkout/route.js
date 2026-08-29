import { z } from 'zod';
import { route } from '@/server/http/route';
import { created } from '@/server/http/respond';
import { intakeLimiter } from '@/server/http/rateLimit';
import * as checkout from '@/server/modules/payments/checkout.service';

/**
 * POST /api/v1/donations/checkout — start a donation from the public page.
 *
 * PUBLIC, AND THE THIRD UNAUTHENTICATED WRITE IN THE SYSTEM. What keeps it safe is not this
 * file but what it refuses to decide: the amount is re-derived in cents by the service, the
 * status is always PENDING, and `paymentReference`, `currency` and `status` are not in the
 * schema at all — a caller cannot send them, so a caller cannot claim a gift was paid.
 *
 * THE AMOUNT ARRIVES IN RANDS AND LEAVES IN CENTS. The boundary is the service, exactly as
 * CLAUDE.md requires: zod accepts rands, `amountToCents` converts once, and nothing downstream
 * ever sees a float.
 *
 * RATE LIMITED ON THE INTAKE BUCKET rather than a new one. The abuse shape is the same —
 * an unauthenticated write, cheap to repeat — and five an hour per address is comfortably
 * above what a real donor does and far below what a script needs.
 */
const checkoutSchema = z.object({
  name: z.string().trim().min(1, 'Please give a name for the receipt').max(200),
  email: z.email({ error: 'Enter a valid email address' }).trim().toLowerCase(),
  phone: z.string().trim().max(30).optional(),
  /** Rands. Bounds and the conversion to cents live in the service, with the money. */
  amount: z.coerce.number({ error: 'Enter an amount to give' }),
  paymentMethod: z.enum(['PAYSTACK', 'PAYPAL'], { error: 'Choose how you would like to pay' }),
  message: z.string().trim().max(1000).optional(),
  anonymous: z.coerce.boolean().optional(),
});

export const POST = route({ body: checkoutSchema }, async ({ body, ctx }) => {
  intakeLimiter.check(`donate:${ctx.ip}`);
  return created(await checkout.startDonation(body, ctx));
});
