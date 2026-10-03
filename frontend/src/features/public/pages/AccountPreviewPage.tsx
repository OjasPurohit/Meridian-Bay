import { Link, useLocation } from 'react-router-dom';

import { PlaceholderArt } from '@/components/ui/PlaceholderArt';

export default function AccountPreviewPage() {
  const signup = useLocation().pathname === '/signup';
  return (
    <section className="grid min-h-[100svh] bg-sand pt-18 lg:grid-cols-2">
      <div className="flex flex-col justify-center px-5 py-20 md:px-16">
        <p className="eyebrow text-olive-mid">{signup ? 'Sign up' : 'Log in'}</p>
        <h1 className="display mt-6 text-[clamp(2.6rem,5vw,4.5rem)] leading-[0.98]">{signup ? 'Member accounts are on the way.' : 'Member log in is on the way.'}</h1>
        <p className="mt-6 max-w-md text-lg leading-relaxed text-muted">
          This preview covers the public website only. Logging in, signing up and the member, desk, kitchen, business and owner dashboards arrive in the next release.
        </p>
        <div className="mt-10 flex flex-wrap gap-6">
          <Link to="/" className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4">
            Back to the homepage
          </Link>
          <a href="/#visit" className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4">
            Send an enquiry instead
          </a>
        </div>
      </div>
      <PlaceholderArt variant="padel" caption="Glass-walled padel court" tilt={14} zoom={1.7} className="hidden min-h-full lg:block" />
    </section>
  );
}
