import { Clock, UserCheck, UserPlus, Users } from 'lucide-react';

import { ALL_MEMBERS } from '../../store/staticData';
import { Kpi, PageHeader, PageSkeleton, Section, usePageReady } from '../../ui/kit';
import { MembersTable } from '../desk/DeskMembers';

export default function OwnerMembers() {
  const ready = usePageReady();
  if (!ready) return <PageSkeleton rows={1} />;
  const active = ALL_MEMBERS.filter((m) => m.status === 'ACTIVE');
  const expiring = active.filter((m) => (m.days_left ?? 99) <= 30);
  const recent = ALL_MEMBERS.filter((m) => m.joined_on >= '2026-09-03');
  return (
    <>
      <PageHeader eyebrow="Members" title="Everyone in the club" />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi tone="olive" icon={Users} label="Members on record" value={ALL_MEMBERS.length} note="all time" />
        <Kpi icon={UserCheck} label="Active memberships" value={active.length} note={`${Math.round((active.length / ALL_MEMBERS.length) * 100)}% of members`} delay={70} />
        <Kpi tone="sun" icon={Clock} label="Renewing in 30 days" value={expiring.length} note="reach out early" delay={140} />
        <Kpi icon={UserPlus} label="Joined in 30 days" value={recent.length} delay={210} />
      </div>
      <Section eyebrow="Directory" title="Members"><MembersTable pageSize={15} /></Section>
    </>
  );
}
