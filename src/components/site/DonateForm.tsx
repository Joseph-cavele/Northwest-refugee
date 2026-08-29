'use client';

import { useState } from 'react';
import { Building2, CreditCard } from 'lucide-react';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { buttonClasses } from '@/components/ui/button-classes';
import { formatRandsWhole, parseCents } from '@/lib/money';
import { PILLAR_LABELS } from '@/types/enums';
import { ORG } from '@/lib/site';
import { cn } from '@/lib/utils';

/*
 * The donation form.
 *
 * ============================================================================================
 *  NO CARD IS TAKEN HERE, AND NO GATEWAY IS WIRED YET. READ THIS BEFORE CHANGING THE BUTTON.
 * ============================================================================================
 *
 * Paystack is the only gateway this system will use and the pieces exist —
 * `paystack.provider.js` can initialise a transaction, and the webhook that settles one is
 * built and hardened. WHAT DOES NOT EXIST IS THE ROUTE BETWEEN THEM: there is no public
 * endpoint that starts a payment. Every fundraising route is permission-gated, because it was
 * written for staff recording gifts that arrived offline.
 *
 * So this form does everything except take money: it collects the amount, what the gift is
 * for, and who is giving, and hands that to `startCheckout` below — a single function that is
 * the whole seam. Today it composes an email to the office. When the endpoint exists it posts
 * to it and redirects to Paystack, and nothing else in this file changes.
 *
 * WHY NOT JUST BUILD THE ENDPOINT. Because a public, unauthenticated route that initiates
 * payments is the one thing in this codebase where the known rate-limiting gap actually bites:
 * CLAUDE.md records that the limiter is per-instance and in memory, so the effective limit is
 * N × whatever is configured and a cold start resets the bucket. That is tolerable on a read
 * endpoint and not on one that mints payment references. It is a piece of work to be done
 * deliberately, with a shared store, not slipped in behind a page.
 *
 * AMOUNTS ARE INTEGER CENTS from the moment they leave the input. `parseCents` is the same
 * parser the dashboard's finance forms use — it refuses anything that is not money and never
 * multiplies a float by 100, which is how R1 234,55 becomes 123454 cents on a rounding error.
 *
 * ONLINE AND OFFLINE ARE BOTH REAL CHOICES, and only one of them currently ends in a payment.
 * Offline works today: the donor says they will pay by EFT or bring it in, and the office sends
 * details or expects them. Online is the one waiting on a gateway. The form asks anyway,
 * because a donor who has chosen "online" and been told to wait has been told something
 * accurate, where a form with no choice at all quietly implies there is only one way to give.
 *
 * TODO(NWHR): PayPal is planned alongside Paystack. CLAUDE.md currently states that Paystack is
 * "the only gateway" — that line becomes untrue the day PayPal is added, and it is the kind of
 * architectural statement other people rely on. Update it in the same change, and note that
 * PayPal's IPN needs its own verification path: it does not share Paystack's HMAC-SHA512
 * signature scheme, so `verifyWebhookSignature` cannot be reused for it.
 *
 * TODO(NWHR): confirm whether NWHR holds Section 18A approval. If it does, this form should
 * offer a tax certificate and collect the donor's details for it; if it does not, the page
 * must not imply one, which is why nothing here mentions a receipt.
 */

/*
 * How the money actually arrives. `available` is what separates a route that works today from
 * one that is waiting on a gateway, and it drives the copy rather than hiding the option.
 */
const METHODS = [
  {
    id: 'online',
    Icon: CreditCard,
    label: 'Online',
    hint: 'Card or PayPal',
    available: false,
  },
  {
    id: 'offline',
    Icon: Building2,
    label: 'EFT or in person',
    hint: 'Bank transfer, or bring it to the office',
    available: true,
  },
] as const;

type MethodId = (typeof METHODS)[number]['id'];

/** The presets, in cents. Small enough to be ordinary, spaced so the choice is quick. */
const PRESETS = [100_00, 250_00, 500_00, 1_000_00];

/*
 * What a gift can be directed at. The five pillars come from types/enums.ts, so this list
 * cannot drift from the categories the register itself validates against.
 */
const DESIGNATIONS = [
  { id: 'where-needed', label: 'Wherever it is needed most' },
  { id: 'ADVOCACY_DOCUMENTATION', label: PILLAR_LABELS.ADVOCACY_DOCUMENTATION },
  { id: 'EDUCATION', label: PILLAR_LABELS.EDUCATION },
  { id: 'SKILLS_ENTREPRENEURSHIP', label: PILLAR_LABELS.SKILLS_ENTREPRENEURSHIP },
  { id: 'SOCIAL_COHESION', label: PILLAR_LABELS.SOCIAL_COHESION },
  { id: 'WOMEN_YOUTH_EMPOWERMENT', label: PILLAR_LABELS.WOMEN_YOUTH_EMPOWERMENT },
];

export function DonateForm() {
  const [preset, setPreset] = useState<number | null>(PRESETS[1] ?? null);
  const [custom, setCustom] = useState('');
  const [designation, setDesignation] = useState(DESIGNATIONS[0]!.id);
  const [method, setMethod] = useState<MethodId>('online');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState<{ amount?: string; email?: string }>({});

  /** The chosen amount in cents, or null when nothing valid is selected or typed. */
  const cents = preset ?? parseCents(custom);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const next: typeof errors = {};
    if (cents === null || cents <= 0) next.amount = 'Choose an amount, or type one.';
    if (!email.trim()) next.email = 'We need an email address to send confirmation to.';

    setErrors(next);
    if (Object.keys(next).length > 0 || cents === null) return;

    startCheckout({ cents, designation, method, name: name.trim(), email: email.trim() });
  }

  /*
   * THE SEAM. Replace the body with a POST to the checkout endpoint and a redirect to the
   * authorisation URL it returns; leave the signature alone.
   */
  function startCheckout(gift: {
    cents: number;
    designation: string;
    method: MethodId;
    name: string;
    email: string;
  }) {
    const chosen = DESIGNATIONS.find((option) => option.id === gift.designation);
    const body = [
      `I would like to donate ${formatRandsWhole(gift.cents)}.`,
      `Towards: ${chosen?.label ?? 'Wherever it is needed most'}`,
      gift.method === 'online'
        ? 'How: online, by card or PayPal — please send me a payment link.'
        : 'How: EFT or in person — please send me the banking details.',
      gift.name ? `Name: ${gift.name}` : null,
      `Email: ${gift.email}`,
      '',
      'Please send me the details for making the payment.',
    ]
      .filter((line) => line !== null)
      .join('\n');

    window.location.href = `mailto:${ORG.email}?subject=${encodeURIComponent(
      `Donation of ${formatRandsWhole(gift.cents)}`
    )}&body=${encodeURIComponent(body)}`;
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-8">
      {/* --- the amount ----------------------------------------------------------------- */}
      <fieldset>
        <legend className="text-sm font-semibold text-ink-950">How much would you like to give?</legend>

        {/*
         * Buttons in a radiogroup rather than four <input type="radio">: the control is a
         * choice of one, and `aria-checked` on a button in a radiogroup announces exactly that
         * without fighting the browser's own radio styling for a 56px target.
         */}
        <div role="radiogroup" aria-label="Amount" className="mt-3 flex flex-wrap gap-3">
          {PRESETS.map((value) => {
            const isChosen = preset === value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={isChosen}
                onClick={() => {
                  setPreset(value);
                  setCustom('');
                }}
                className={cn(
                  'min-h-12 rounded-full border px-6 text-sm font-bold tabular-nums transition-colors',
                  isChosen
                    ? 'border-brand-500 bg-brand-500 text-white'
                    : 'border-line bg-surface text-ink-950 hover:border-ink-950'
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
                name="amount"
                inputMode="decimal"
                placeholder="R"
                value={custom}
                onChange={(event) => {
                  setCustom(event.target.value);
                  // Typing is a choice too: it clears the preset rather than competing with it.
                  setPreset(null);
                }}
              />
            )}
          </Field>
        </div>
      </fieldset>

      {/* --- what it is for -------------------------------------------------------------- */}
      <Field
        label="What should it go towards?"
        hint="Undirected gifts are the most useful — they cover the costs no funder wants to pay for, like transport to Home Affairs."
      >
        {(field) => (
          <select
            {...field}
            name="designation"
            value={designation}
            onChange={(event) => setDesignation(event.target.value)}
            className="w-full rounded-md border border-transparent bg-ink-50 p-3 text-sm text-body transition-colors hover:bg-ink-100 focus:border-brand-500 focus:bg-surface focus:ring-3 focus:ring-brand-100 focus:outline-none"
          >
            {DESIGNATIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        )}
      </Field>

      {/* --- how it will be paid --------------------------------------------------------- */}
      <fieldset>
        <legend className="text-sm font-semibold text-ink-950">How would you like to pay?</legend>

        <div role="radiogroup" aria-label="Payment method" className="mt-3 grid gap-3 sm:grid-cols-2">
          {METHODS.map(({ id, Icon, label, hint, available }) => {
            const isChosen = method === id;
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={isChosen}
                onClick={() => setMethod(id)}
                className={cn(
                  'flex min-h-16 items-center gap-4 rounded-2xl border p-4 text-left transition-colors',
                  isChosen
                    ? 'border-brand-500 bg-brand-50'
                    : 'border-line bg-surface hover:border-ink-950'
                )}
              >
                <Icon
                  className={cn('size-6 shrink-0', isChosen ? 'text-brand-600' : 'text-muted')}
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
                <span>
                  <span className="block text-sm font-bold text-ink-950">{label}</span>
                  <span className="mt-0.5 block text-sm text-muted">
                    {hint}
                    {/* The unavailability is part of the option's own label, so a screen reader
                        hears it when choosing rather than discovering it at the button. */}
                    {!available && ' — not switched on yet'}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      {/* --- who is giving --------------------------------------------------------------- */}
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Your name" optional>
          {(field) => (
            <Input
              {...field}
              name="name"
              autoComplete="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          )}
        </Field>

        <Field label="Your email" error={errors.email}>
          {(field) => (
            <Input
              {...field}
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          )}
        </Field>
      </div>

      <div>
        <button type="submit" className={buttonClasses('primary', { fullWidth: true })}>
          {cents === null ? 'Continue' : `Give ${formatRandsWhole(cents)}`}
        </button>

        {/*
         * Says what pressing it does, and it differs by route: online is waiting on a gateway,
         * offline is simply how an EFT has always been arranged. When the checkout endpoint
         * lands, the first branch is the thing to delete.
         */}
        <p className="mt-4 text-sm leading-6 text-muted">
          {method === 'online'
            ? 'Card and PayPal are not switched on yet. This opens your email app so the office can send you a payment link — or call '
            : 'This opens your email app so the office can send you the banking details — or call '}
          <a href={ORG.phoneHref} className="font-semibold text-brand-600 underline">
            {ORG.phone}
          </a>{' '}
          and arrange it in a minute.
        </p>
      </div>
    </form>
  );
}

export default DonateForm;
