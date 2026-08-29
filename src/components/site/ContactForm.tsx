'use client';

import { useState } from 'react';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { buttonClasses } from '@/components/ui/button-classes';
import { ORG } from '@/lib/site';

/*
 * The public contact form.
 *
 * ============================================================================================
 *  THERE IS NO CONTACT ENDPOINT. THIS FORM DOES NOT POST ANYWHERE, AND THAT IS DELIBERATE.
 * ============================================================================================
 *
 * Every route under /api/v1 that could take a message from the public is permission-gated —
 * `service-requests` needs SERVICE_REQUEST_CREATE, which no visitor has. A form whose submit
 * button did nothing would be the worst control on the site: somebody in trouble would type
 * out their situation, press send, and believe an organisation had it.
 *
 * So SUBMIT OPENS THE READER'S OWN MAIL CLIENT, with the message already composed. It is a
 * real action with a visible result and it needs no backend. The line under the button is what
 * says so — see the note on the button itself, which carries a send label by instruction.
 *
 * AND IT TURNS OUT TO BE THE BETTER PRIVACY ANSWER WHILE IT LASTS. Nothing typed here reaches
 * this system, so there is nothing stored without consent, nothing to encrypt, and no record
 * of somebody's immigration situation sitting in a database nobody has decided the retention
 * rules for yet. A hand-rolled contact endpoint on a system holding special personal
 * information is not a small feature.
 *
 * THE PHONE IS THE PRIMARY ROUTE AND THE PAGE SAYS SO. This audience reads the site on cheap
 * phones over patchy data, and a good share have no mail client configured at all — for them
 * `mailto:` opens nothing. That is why the details column beside this form leads with a number
 * to call, and why this form is the second option on the page rather than the first.
 *
 * TODO(NWHR): when a public contact endpoint exists — with consent captured before storage, a
 * retention period agreed, and rate limiting that survives more than one serverless instance —
 * swap the mailto in `handleSubmit` for a POST. At that point the button's label becomes true
 * on its own and the sentence under it can go.
 */

export function ContactForm() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');

  /*
   * Errors are held per field and cleared on the next attempt, not on every keystroke.
   * Validating while somebody is still typing their name tells them it is wrong before they
   * have finished writing it.
   */
  const [errors, setErrors] = useState<{ name?: string; message?: string }>({});

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const next: typeof errors = {};
    if (!name.trim()) next.name = 'Please give a name we can use when we reply.';
    if (!message.trim()) next.message = 'Tell us what you need help with.';

    setErrors(next);
    if (Object.keys(next).length > 0) return;

    /*
     * Composed rather than concatenated into the href by hand: a message containing an
     * ampersand or a hash would otherwise truncate the body at that character, and a person
     * describing a permit number would never know half their message was missing.
     */
    const body = [
      `Name: ${name.trim()}`,
      email.trim() ? `Email: ${email.trim()}` : null,
      '',
      message.trim(),
    ]
      .filter((line) => line !== null)
      .join('\n');

    const href = `mailto:${ORG.email}?subject=${encodeURIComponent(
      `Website enquiry from ${name.trim()}`
    )}&body=${encodeURIComponent(body)}`;

    window.location.href = href;
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="mt-8 space-y-5">
      <Field label="Your name" error={errors.name}>
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

      <Field
        label="Your email"
        optional
        hint="Only if you would like a written reply. A phone number in the message works too."
      >
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

      <Field label="Your message" error={errors.message}>
        {(field) => (
          <Textarea
            {...field}
            name="message"
            rows={5}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
          />
        )}
      </Field>

      {/*
       * "Send message", at NWHR's instruction. The label the button carried first was "Write
       * this email", because that is literally what pressing it does — and a send label on a
       * control that only opens a mail client is how somebody walks away believing a message
       * was sent when it is still sitting unsent in their drafts.
       *
       * THE SENTENCE UNDERNEATH IS THEREFORE LOAD-BEARING and must not be trimmed as
       * decoration: it is now the only place on the page that says what actually happens. If
       * the button keeps this label, that line stays with it.
       */}
      <button type="submit" className={buttonClasses('primary', { fullWidth: true })}>
        Send message
      </button>

      <p className="text-sm leading-6 text-muted">
        This opens your email app with the message ready to send — you press send there, and
        nothing is stored on this site. If email is difficult, call{' '}
        <a href={ORG.phoneHref} className="font-semibold text-brand-600 underline">
          {ORG.phone}
        </a>{' '}
        instead.
      </p>
    </form>
  );
}

export default ContactForm;
