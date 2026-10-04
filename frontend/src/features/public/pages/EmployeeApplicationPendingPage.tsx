import { Link, useSearchParams } from 'react-router-dom';
import { Hourglass } from 'lucide-react';

import { openLoginMenu, useAuth } from '@/auth/AuthProvider';
import { formatDateIst } from '@/lib/format';

/**
 * Where a PENDING job applicant lands (after applying, and after logging in). The server gave them no session, so there
 * is no dashboard behind this page: it only explains where the application stands.
 */
export default function EmployeeApplicationPendingPage() {
  const { pending, session } = useAuth();
  const [params] = useSearchParams();
  const justSent = params.get('submitted') === '1';

  return (
    <section aria-labelledby="pending-title" className="flex min-h-[80svh] items-start justify-center bg-sand px-5 pt-36 pb-24">
      <div className="w-full max-w-xl border border-line bg-chalk p-6 sm:p-10">
        <Hourglass className="size-9 text-olive-mid" aria-hidden="true" />
        <p className="eyebrow mt-5 text-olive-mid">Employee application</p>
        <h1 id="pending-title" className="display mt-2 text-[clamp(2rem,4vw,3rem)] leading-[1.02]">
          Your job application is under review.
        </h1>

        {justSent && (
          <p role="status" className="mt-5 border-l-2 border-olive bg-sand px-4 py-3 text-sm font-semibold">
            Your job application has been sent to the owner for approval.
          </p>
        )}

        {pending && (
          <dl className="mt-6 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
            <dt className="text-muted">Applicant</dt>
            <dd className="font-semibold">{pending.full_name}</dd>
            <dt className="text-muted">Email</dt>
            <dd>{pending.email}</dd>
            <dt className="text-muted">Received</dt>
            <dd>{formatDateIst(pending.applied_at)}</dd>
          </dl>
        )}

        <ul className="mt-6 space-y-3 text-sm leading-relaxed text-muted">
          <li>We have received your application.</li>
          <li>The club owner has to approve it before you can work in the system.</li>
          <li>When it is approved, the role the owner gives you decides which dashboard you see: front desk, kitchen or store.</li>
          <li>
            Until then you have no employee access. Come back and <strong className="text-ink">log in again with the same email and password</strong> after approval.
          </li>
        </ul>

        <div className="mt-8 flex flex-wrap gap-3">
          {!session && (
            <button type="button" onClick={openLoginMenu} className="inline-flex min-h-11 items-center rounded-full border border-ink/25 px-5 font-semibold hover:border-ink">
              Log in
            </button>
          )}
          <Link to="/" className="inline-flex min-h-11 items-center px-2 font-semibold underline underline-offset-4">
            Back to the home page
          </Link>
        </div>
      </div>
    </section>
  );
}
