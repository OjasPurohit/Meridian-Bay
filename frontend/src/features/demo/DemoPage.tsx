import { Info } from 'lucide-react';

import { DemoAccess } from './DemoAccess';

export default function DemoPage() {
  return (
    <div className="bg-sand pt-18">
      <div className="mx-auto w-full max-w-[1440px] px-5 pt-14 pb-24 md:px-10 md:pt-20">
        <p className="eyebrow text-olive-mid">Presentation mode</p>
        <h1 className="display mt-4 max-w-3xl text-[clamp(2.4rem,5.5vw,4.5rem)] leading-[0.98] text-balance">One club. Five points of view.</h1>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted">Pick a role to step straight into its dashboard — no password needed. Bookings, orders and kitchen updates flow between roles, so open a second tab to watch them react.</p>
        <div role="note" className="mt-6 flex max-w-3xl gap-3 border border-sun/50 bg-sun/12 px-4 py-3 text-sm">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p>
            <span className="font-semibold">Temporary demo sign-in.</span> Uses fictional seed data stored in this browser only; it is removed before launch.
          </p>
        </div>
        <div className="mt-12">
          <DemoAccess />
        </div>
      </div>
    </div>
  );
}
