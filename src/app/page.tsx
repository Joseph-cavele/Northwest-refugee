import type { Metadata } from 'next';
import { SiteNav } from '@/components/site/SiteNav';
import { Hero } from '@/components/site/Hero';
import { About } from '@/components/site/About';
import { Mission } from '@/components/site/Mission';
import { Appeals } from '@/components/site/Appeals';
import { ProgrammeShowcase } from '@/components/site/ProgrammeShowcase';
import { GetInvolved } from '@/components/site/GetInvolved';
import { Volunteers } from '@/components/site/Volunteers';
import { Testimonials } from '@/components/site/Testimonials';
import { Contact } from '@/components/site/Contact';
import { SiteFooter } from '@/components/site/SiteFooter';
import { ChatGuide } from '@/components/site/ChatGuide';
import { ORG } from '@/lib/site';

export const metadata: Metadata = {
  title: `${ORG.name} — ${ORG.city}`,
  description:
    'Find the right support, services and programmes. Help with permits and documents, school places, skills training and social support for refugees, asylum seekers and migrants in Rustenburg, North West.',
};

/*
 * `/` — the public front page. Navigation, hero, footer.
 *
 * THE MIDDLE IS DELIBERATELY EMPTY. Everything between the hero and the footer was taken out;
 * the sections themselves are untouched on disk and each is one import and one line from
 * coming back:
 *
 *   HowItWorks · About · Impact · Partners · DonateBand · Pillars · WaysToHelp
 *
 * All of them are built to design/DESIGN.md — 1280px centred, 20px margins on mobile and 64px
 * from lg, Inter throughout, and the palette sampled from the logo rather than DESIGN.md's own
 * #D4AF37, because the mark outranks the document on colour and only on colour. Restore them
 * in whatever order the page needs rather than assuming the one they were in.
 *
 * Nothing unreferenced here is bundled, so an unmounted section costs a visitor nothing.
 */
export default function Home() {
  return (
    <>
      <SiteNav />

      <main>
        <Hero />
        {/* §16 slot four, "How NWHR Helps". Services (slot three) is not built yet, so this
            currently follows the hero directly — the order is right, the gap is upstream. */}
        <About />
        {/* The mission section. No photographs, no film, and its two dials and two money
            figures are PLACEHOLDERS — read the warning at the top of Mission.tsx. */}
        <Mission />
        {/* The appeals carousel. Its five "raised" figures are INVENTED, for the progress
            animation to have something to draw — read the warning at the top of Appeals.tsx
            before this page is served to anybody. */}
        <Appeals />
        {/* The programme strip. No photographs yet — every panel is a reservation, and the
            briefs are stricter than usual because four of the five are greyscale at any
            moment; see the notes in ProgrammeShowcase. */}
        <ProgrammeShowcase />
        {/* The two-door band, full bleed. No photographs and no film yet — all three panels
            are reservations; see the notes in GetInvolved. */}
        <GetInvolved />
        {/* The volunteer row. Nobody is named, no portraits exist and the profile links are
            placeholders — all three wait on recorded consent; see the notes in Volunteers. */}
        <Volunteers />
        {/* The testimonial carousel. Every quote, name and score is a reservation — see the
            notes in Testimonials.tsx before filling any of them in. */}
        <Testimonials />
        {/* The contact card. The form composes an email rather than posting — there is no
            public contact endpoint; see the warning at the top of ContactForm.tsx. */}
        <Contact />
      </main>

      <SiteFooter />

      {/* Outside <main>: it floats over the page rather than belonging to a section, and it is
          a persistent aid rather than page content. It is also now the only route from this
          page to a service, so removing it would leave the hero's buttons as the only way in. */}
      <ChatGuide />
    </>
  );
}
