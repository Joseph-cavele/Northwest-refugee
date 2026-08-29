import { ImageIcon, Mail, MapPin, MessageCircle, Phone } from 'lucide-react';
import Image from 'next/image';
import { ContactForm } from './ContactForm';
import { SocialRow } from '@/components/ui/social-row';
import { ORG, SOCIAL_LINKS } from '@/lib/site';

/*
 * "Let's talk" — the contact card, built to a supplied reference: white card floating on a
 * coloured field, form on the left, illustration and details on the right.
 *
 * THE FIELD IS BRAND BLUE, NOT THE REFERENCE'S PURPLE, for the reason every other section on
 * this site records: the palette is sampled from the logo and purple is not in it. Blue is the
 * one ground here that carries white type at 7.3:1.
 *
 * THE DETAILS ARE THE ORGANISATION'S REAL ONES, from lib/site.ts — the street address, the
 * landmark that actually finds it, one phone number and one email address. The landmark is
 * printed under the address rather than instead of it: "next to FNB" is what somebody standing
 * in Pretorius Street needs, and "12 Pretorius Street" is what a taxi driver and a letter
 * need.
 *
 * THE NUMBER COMES FIRST AND THE FORM SECOND. The reference leads with the form, which suits a
 * software company taking enquiries. This audience reads the site on cheap phones over patchy
 * data, often with no mail client configured, and the fastest route to help is somebody
 * answering a phone. The form is real and it works — see ContactForm — but it is not the thing
 * a person in trouble should have to find first.
 *
 * TODO(NWHR): confirm and add the street address, and replace the placeholder social profiles
 * in lib/site.ts. Both are marked there.
 */

/*
 * The illustration the reference puts opposite the form.
 *
 * DECORATIVE, SO THE ALT IS EMPTY AND STAYS EMPTY. It draws an envelope, a paper plane and a
 * speech bubble — "you can write to us", which is what the heading, the form and the email
 * address beside it already say three times. Describing it to a screen reader would be a
 * fourth telling of the same thing before the details it came for.
 *
 * IT ARRIVED WITH THE TRANSPARENCY CHECKERBOARD PAINTED INTO IT rather than in an alpha
 * channel — colour type 2, no alpha — so the grid was flood-filled out to white and the
 * enclosed grey inside the ring shapes cleared with it. The file therefore has a WHITE ground,
 * not a transparent one, which is why the frame below is white rather than ink-50: on any
 * other colour its own square would show.
 */
const ILLUSTRATION = {
  src: '/cards-images/contact-illustration.png' as string | null,
  alt: '',
  brief: 'Square — an envelope and a paper plane, in the mark’s four colours',
};

export function Contact() {
  return (
    <section aria-labelledby="contact-heading" className="bg-brand-500 font-(family-name:--font-ui)">
      <div className="mx-auto max-w-[80rem] px-4 py-16 lg:px-8 lg:py-24">
        {/* The card, floating on the field. */}
        <div className="rounded-[2rem] bg-surface p-6 sm:p-10 lg:p-14">
          <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
            {/* --- the form ------------------------------------------------------------ */}
            <div>
              <h2
                id="contact-heading"
                className="text-[clamp(1.75rem,4vw,2.5rem)] leading-tight font-extrabold tracking-[-0.02em] text-ink-950"
              >
                Let&rsquo;s talk
              </h2>
              <p className="mt-4 max-w-md text-base leading-7 text-muted">
                Tell us what you need help with and we will come back to you. If it is urgent, or
                writing is difficult, call instead — somebody answers during office hours.
              </p>

              <ContactForm />
            </div>

            {/* --- the picture and the details ----------------------------------------- */}
            <div className="flex flex-col">
              <div className="relative aspect-square w-full max-w-sm self-center overflow-hidden rounded-3xl bg-white">
                {ILLUSTRATION.src ? (
                  <Image
                    src={ILLUSTRATION.src}
                    alt={ILLUSTRATION.alt}
                    fill
                    sizes="(min-width: 1024px) 24rem, 100vw"
                    className="object-contain object-center"
                  />
                ) : (
                  <div className="grid h-full place-items-center border-2 border-dashed border-line-strong p-6 text-center">
                    <span>
                      <ImageIcon
                        className="mx-auto size-8 text-line-strong"
                        strokeWidth={1.5}
                        aria-hidden="true"
                      />
                      <span className="mt-3 block text-sm font-semibold text-subtle">
                        {ILLUSTRATION.brief}
                      </span>
                    </span>
                  </div>
                )}
              </div>

              {/*
               * A description list, because that is what this is: four labelled facts. The
               * labels are visually hidden rather than absent — an icon alone tells a screen
               * reader nothing, and "+27 81 496 8907" read out with no label is a number
               * somebody has to guess the purpose of.
               */}
              <dl className="mt-10 space-y-5 border-t border-line pt-8">
                <div className="flex gap-4">
                  <MapPin className="mt-0.5 size-5 shrink-0 text-brand-500" aria-hidden="true" />
                  <div>
                    <dt className="sr-only">Where we are</dt>
                    {/* One <address> for the whole location, not three loose lines: it is the
                        element that says "this is where to find the people behind this page",
                        and browsers and parsers both treat it that way. Its default italic is
                        turned off — the address is a fact, not an aside. */}
                    <dd>
                      <address className="text-sm leading-6 text-body not-italic">
                        {ORG.address}
                        <span className="mt-0.5 block text-muted">{ORG.addressHint}</span>
                      </address>
                    </dd>
                  </div>
                </div>

                <div className="flex gap-4">
                  <Phone className="mt-0.5 size-5 shrink-0 text-brand-500" aria-hidden="true" />
                  <div>
                    <dt className="sr-only">Phone</dt>
                    <dd>
                      {/*
                       * Displayed locally, dialled internationally — lib/site.ts explains why
                       * the two differ. min-h-11 because this is the control most likely to be
                       * pressed on this page, by somebody standing in a queue.
                       */}
                      <a
                        href={ORG.phoneHref}
                        className="inline-flex min-h-11 items-center text-sm leading-6 font-semibold text-body hover:text-brand-600"
                      >
                        {ORG.phone}
                      </a>
                    </dd>
                  </div>
                </div>

                <div className="flex gap-4">
                  <Mail className="mt-0.5 size-5 shrink-0 text-brand-500" aria-hidden="true" />
                  <div>
                    <dt className="sr-only">Email</dt>
                    <dd>
                      <a
                        href={`mailto:${ORG.email}`}
                        className="inline-flex min-h-11 items-center text-sm leading-6 text-body hover:text-brand-600"
                      >
                        {ORG.email}
                      </a>
                    </dd>
                  </div>
                </div>

                <div className="flex gap-4">
                  <MessageCircle
                    className="mt-0.5 size-5 shrink-0 text-brand-500"
                    aria-hidden="true"
                  />
                  <div>
                    <dt className="sr-only">Languages</dt>
                    {/* The four the assistant is keyed by, so nobody arrives expecting a
                        language the office cannot answer in. */}
                    <dd className="text-sm leading-6 text-body">
                      English · Français · Kiswahili · Português
                    </dd>
                  </div>
                </div>
              </dl>

              <SocialRow links={SOCIAL_LINKS} inline className="mt-8 text-brand-500" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default Contact;
