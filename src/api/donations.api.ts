import { api } from './client';

/*
 * The public donation endpoints.
 *
 * WHAT IS NOT IN THESE TYPES IS THE SECURITY BOUNDARY. A caller cannot send a status, a
 * currency, a payment reference or an amount in cents, because none of them is a field here —
 * and the server's schema refuses them too, so the two agree. The client proposes an amount in
 * rands and a gateway; the server decides everything else.
 *
 * NO KEYS EVER REACH THIS FILE. Paystack and PayPal are called from the server with secrets
 * that live in the server's own environment; the browser only ever receives a URL to be sent
 * to. That is why there is no publishable key here and no gateway SDK in the bundle.
 */

export type PaymentMethod = 'PAYSTACK' | 'PAYPAL';

export interface DonationRequest {
  name: string;
  email: string;
  phone?: string;
  /** Rands. The server converts once, to integer cents, and bounds it. */
  amount: number;
  paymentMethod: PaymentMethod;
  message?: string;
  anonymous?: boolean;
}

export interface DonationStarted {
  reference: string;
  /** Where to send the donor. Always the gateway's own domain. */
  redirectUrl: string;
  amountCents: number;
}

/**
 * What the success page is allowed to read back.
 *
 * `status` is the server's, set by a webhook after a server-to-server verification. Nothing
 * the browser does can move it, which is why the success page can be trusted to say "thank
 * you" only when it says SETTLED.
 */
export interface DonationReceipt {
  reference: string;
  amountCents: number;
  currency: string;
  method: string;
  status: 'PENDING' | 'SETTLED' | 'FAILED' | 'REFUNDED';
  receiptNumber: string | null;
  /** Null for an anonymous donor — the page thanks them without naming them. */
  donorName: string | null;
  settledAt: string | null;
  createdAt: string;
}

export function startDonation(body: DonationRequest) {
  return api.post<DonationStarted>('/donations/checkout', body, { anonymous: true });
}

export function readReceipt(reference: string) {
  return api.get<DonationReceipt>('/donations/receipt', {
    query: { reference },
    anonymous: true,
  });
}
