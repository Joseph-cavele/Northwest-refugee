'use client';

import { useState } from 'react';
import { Building2, CreditCard, Loader2 } from 'lucide-react';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { buttonClasses } from '@/components/ui/button-classes';
import { startDonation } from '@/api/donations.api';
import type { PaymentMethod } from '@/api/donations.api';
import { ApiError } from '@/api/errors';
import { formatRandsWhole, parseCents } from '@/lib/money';
import { ORG } from '@/lib/site';
import { cn } from '@/lib/utils';

/*
 * The donation form.
 *
 * ============================================================================================
 *  THIS FORM NEVER TOUCHES A CARD, A KEY, OR A PAYMENT STATUS. THOSE ARE ALL SERVER-SIDE.
 * ============================================================================================
 *
 * WHAT IT ACTUALLY DOES. It collects a name, an email, an amount in rands and a choice of
 * gateway, posts them to `/api/v1/donations/checkout`, and follows the URL that comes back.
 * The card details are entered on Paystack's or PayPal's own page, on their domain, under
 * their PCI scope — which is why there is no card number field here and never should be.
 *
 * THE AMOUNT SHOWN IS NOT THE AMOUNT CHARGED. The server re-derives it in cents from the rands
 * posted, bounds it, writes it to the donation, and asks the gateway to collect exactly that.
 * When the money lands, the webhook compares the two and refuses a mismatch. So the number on
 * this button is a proposal, and every later step treats it as one.
 *
 * ANONYMOUS MEANS "DO NOT NAME ME", NOT "DO NOT KNOW ME". The name and email are still
 * required, because a s18A tax certificate has to be issued to somebody and a receipt has to
 * be sent somewhere. What the flag changes is reporting: the donor is not identified in it.
 * Saying that plainly next to the checkbox is the difference between a promise kept and a
 * promise a donor thinks was made.
 *
 * PRESETS ARE CENTS, NOT RANDS, INTERNALLY. `parseCents` handles the custom field — the same
 * parser the dashboard's finance forms use, which refuses anything that is not money and never
 * multiplies a float by 100.
 */

const PRESETS = [100_00, 250_00, 500_00, 1_000_00, 2_500_00];

const METHODS: { id: PaymentMethod; Icon: typeof CreditCard; label: string; hint: string }[] = [
  { id: 'PAYSTACK', Icon: CreditCard, label: 'Card', hint: 'Visa, Mastercard, instant EFT' },
  { id: 'PAYPAL', Icon: Building2, label: 'PayPal', hint: 'Pay from a PayPal balance' },
];

export function DonationForm() {
  const [preset, setPreset] = useState<number | null>(PRESETS[1] ?? null);
  const [custom, setCustom] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('PAYSTACK');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [anonymous, setAnonymous] = useState(false);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const cents = preset ?? parseCents(custom);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const found: Record<string, string> = {};
    if (cents === null || cents <= 0) found.amount = 'Choose an amount, or type one.';
    if (!name.trim()) found.name = 'We need a name for the receipt.';
    if (!email.trim()) found.email = 'We need an email address to send the receipt to.';

    setErrors(found);
    setFailure(null);
    if (Object.keys(found).length > 0 || cents === null) return;

    setSending(true);

    try {
      const started = await startDonation({
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
        // Rands out, cents back: the wire carries what a person typed and the server owns the
        // conversion. Dividing here is the only place this number is ever a float.
        amount: cents / 100,
        paymentMethod: method,
        message: message.trim() || undefined,
        anonymous,
      });

      /*
       * `assign`, not `replace`. The gateway's page is a step forward, not a redirect to be
       * erased — a donor who changes their mind must be able to press Back and land on this
       * form rather than on whatever came before it.
       */
      window.location.assign(started.redirectUrl);
    } catch (error) {
      if (error instanceof ApiError && error.hasFieldErrors) {
        setErrors(
          Object.fromEntries(
            Object.entries(error.details).map(([path, msg]) => [path.split('.').pop() ?? path, msg])
          )
        );
      }
      setFailure(
        error instanceof ApiError
          ? error.message
          : 'We could not start the payment. Please try again, or telephone the office.'
      );
      setSending(false);
    }
    // No `finally`: on success the browser is navigating away, and clearing the spinner would
    // show an enabled button for the moment before the gateway page paints.
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-8">
      {/* --- amount ---------------------------------------------------------------------- */}
      <fieldset>
        <legend className="text-base font-bold text-ink-950">How much would you like to give?</legend>

        {/*
         * A radiogroup of buttons rather than five <input type="radio">: this is a choice of
         * one, `aria-checked` announces exactly that, and a 48px target is easier to hit on a
         * phone than a browser's own radio.
         */}
        <div role="radiogroup" aria-label="Amount" className="mt-4 flex flex-wrap gap-3">
          {PRESETS.map((value) => {
            const chosen = preset === value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={chosen}
                onClick={() => {
                  setPreset(value);
                  setCustom('');
                }}
                className={cn(
                  'min-h-12 rounded-full border px-6 text-sm font-bold tabular-nums transition-all duration-200',
                  chosen
                    ? 'border-brand-500 bg-brand-500 text-white shadow-md shadow-brand-500/25'
                    : 'border-line bg-surface text-ink-950 hover:-translate-y-0.5 hover:border-ink-950'
                )}
              >
                {formatRandsWhole(value)}
              </button>
            );
          })}
        </div>

        <div className="mt-4 max-w-xs">
          <Field label="Or another amount" error={errors.amount}>
            {(field) => (
              <Input
                {...field}
                inputMode="decimal"
                placeholder="R"
                value={custom}
                onChange={(event) => {
                  setCustom(event.target.value);
                  setPreset(null);
                }}
              />
            )}
          </Field>
        </div>
      </fieldset>

      {/* --- who is giving --------------------------------------------------------------- */}
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Full name" error={errors.name}>
          {(field) => (
            <Input
              {...field}
              autoComplete="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          )}
        </Field>

        <Field label="Email address" error={errors.email} hint="Your receipt goes here.">
          {(field) => (
            <Input
              {...field}
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          )}
        </Field>
      </div>

      <Field label="Phone number" optional>
        {(field) => (
          <Input
            {...field}
            type="tel"
            autoComplete="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
          />
        )}
      </Field>

      <Field label="Message" optional hint="A dedication, or how you would like your gift used.">
        {(field) => (
          <Textarea
            {...field}
            rows={3}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
          />
        )}
      </Field>

      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line p-4 text-sm leading-6 text-body">
        <input
          type="checkbox"
          checked={anonymous}
          onChange={(event) => setAnonymous(event.target.checked)}
          className="mt-1 size-5 shrink-0 accent-brand-500"
        />
        <span>
          Give anonymously
          {/* Said here rather than in a privacy notice nobody opens. */}
          <span className="mt-0.5 block text-muted">
            We still need your name and email to send a receipt — you simply will not be named
            in any report or listing.
          </span>
        </span>
      </label>

      {/* --- how ------------------------------------------------------------------------- */}
      <fieldset>
        <legend className="text-base font-bold text-ink-950">How would you like to pay?</legend>

        <div role="radiogroup" aria-label="Payment method" className="mt-4 grid gap-3 sm:grid-cols-2">
          {METHODS.map(({ id, Icon, label, hint }) => {
            const chosen = method === id;
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={chosen}
                onClick={() => setMethod(id)}
                className={cn(
                  'flex min-h-16 items-center gap-4 rounded-2xl border p-4 text-left transition-all duration-200',
                  chosen
                    ? 'border-brand-500 bg-brand-50'
                    : 'border-line bg-surface hover:-translate-y-0.5 hover:border-ink-950'
                )}
              >
                <Icon
                  className={cn('size-6 shrink-0', chosen ? 'text-brand-600' : 'text-muted')}
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
                <span>
                  <span className="block text-sm font-bold text-ink-950">{label}</span>
                  <span className="mt-0.5 block text-sm text-muted">{hint}</span>
                </span>
              </button>
            );
          })}
        </div>

        {/* Where the card details are actually entered, said before the donor is sent there. */}
        <p className="mt-3 text-sm leading-6 text-muted">
          You will be taken to {method === 'PAYPAL' ? 'PayPal' : 'Paystack'} to pay. Your card
          details are entered there and never reach this website.
        </p>
      </fieldset>

      {failure && (
        <p
          role="alert"
          className="rounded-xl border-2 border-danger-500 bg-danger-50 p-4 text-sm leading-6 text-danger-700"
        >
          {failure}
        </p>
      )}

      <div>
        <button
          type="submit"
          disabled={sending}
          className={buttonClasses('primary', { fullWidth: true, className: 'min-h-14 text-sm' })}
        >
          {sending ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Taking you to {method === 'PAYPAL' ? 'PayPal' : 'Paystack'}
            </>
          ) : cents === null ? (
            'Continue'
          ) : (
            `Donate ${formatRandsWhole(cents)}`
          )}
        </button>

        <p className="mt-4 text-center text-sm leading-6 text-muted">
          Your donation helps us continue supporting vulnerable refugee communities. Questions?
          Ring{' '}
          <a href={ORG.phoneHref} className="font-semibold text-brand-600 underline">
            {ORG.phone}
          </a>
          .
        </p>
      </div>
    </form>
  );
}

export default DonationForm;
