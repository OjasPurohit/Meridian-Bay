import type { MembershipPlan } from '@shared/types/rows';

export const DAY_PASS_SLUG = 'day-pass';

/** URL slug for a plan: GOLD -> "gold". */
export const planSlug = (p: MembershipPlan) => p.membership_type.toLowerCase();

export const planShortName = (p: MembershipPlan) => p.name.replace(/ Membership$/, '');

export const applyHref = (slug: string) => `/membership/apply?plan=${slug}`;
