import Link from 'next/link';
import { Logo, BrandRule } from '@/components/ui/logo';
import { PATHS } from '@/lib/paths';
import { ORG } from '@/lib/site';

/*
 * 404.
 *
 * Offers both exits on purpose. Someone landing here is either a staff member with a
 * stale bookmark or a person looking for help who followed a broken link — and the
 * second group must never be left with only a staff sign-in button.
 */
export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-canvas px-4 py-10">
      <div className="flex w-full max-w-md flex-col items-start gap-5">
        <Logo size={56} />
        <BrandRule />
        <div>
          <p className="text-xs font-semibold tracking-[0.16em] text-subtle uppercase">
            Error 404
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            This page isn&rsquo;t here
          </h1>
          <p className="mt-2 text-sm text-muted">
            The link may be out of date, or the page may have moved.
          </p>
        </div>

        <div className="flex flex-col gap-2 text-sm">
          <Link className="text-brand-500 underline underline-offset-2" href={PATHS.signIn}>
            Sign in to the staff dashboard
          </Link>
          <Link className="text-brand-500 underline underline-offset-2" href={PATHS.getHelp}>
            Get help from {ORG.shortName}
          </Link>
        </div>
      </div>
    </main>
  );
}
