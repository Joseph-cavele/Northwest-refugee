import { z } from 'zod';
import { route } from '@/server/http/route';
import { success } from '@/server/http/respond';
import * as checkout from '@/server/modules/payments/checkout.service';

/**
 * GET /api/v1/donations/receipt?reference=DON-… — what the success page shows.
 *
 * PUBLIC AND READ-ONLY, AND THE REFERENCE IS THE ONLY KEY. That is a deliberate trade, so it
 * is worth stating what it does and does not expose. A reference is unguessable in practice
 * but it travels in a URL, which means browser history, a Referer header and any proxy in
 * between — so this returns the four facts a receipt needs and nothing that would matter if
 * the URL were shared: no donor id, no email, no phone, no internal notes, no provider
 * reference. An anonymous donor gets no name back at all. See readDonationReceipt.
 *
 * IT CANNOT CHANGE ANYTHING. The success page reports the status the webhook has already set;
 * a donor refreshing it a hundred times settles nothing.
 */
export const GET = route(
  { query: z.object({ reference: z.string().trim().min(1, 'A reference is required') }) },
  async ({ query }) => success(await checkout.readDonationReceipt(query.reference))
);
