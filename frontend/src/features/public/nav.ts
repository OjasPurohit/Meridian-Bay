import type { EnquiryType, Uuid } from '@/features/public/types';

/** `to` is a router path; entries with a hash are homepage sections, the rest are standalone pages. */
export const PUBLIC_NAV = [
  { to: '/#courts', label: 'Courts' },
  { to: '/membership', label: 'Membership' },
  { to: '/shop', label: 'Shop' },
  { to: '/bar-cafe', label: 'Bar & café' },
  { to: '/#visit', label: 'Visit' },
] as const;

export const ENQUIRY_PRESET_EVENT = 'enquiry:preset';

export interface EnquiryPreset {
  enquiry_type: EnquiryType;
  membership_plan_id?: Uuid;
}

let pending: EnquiryPreset | null = null;

/** Lets any CTA pre-select the homepage enquiry form, including when the homepage has not mounted yet. */
export function presetEnquiry(detail: EnquiryPreset) {
  pending = detail;
  window.dispatchEvent(new CustomEvent<EnquiryPreset>(ENQUIRY_PRESET_EVENT, { detail }));
}

export function takePendingPreset(): EnquiryPreset | null {
  const p = pending;
  pending = null;
  return p;
}
