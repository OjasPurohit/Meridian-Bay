import type { EnquiryType, Uuid } from '@/features/public/types';

export const PUBLIC_NAV = [
  { href: '/#courts', label: 'Courts' },
  { href: '/#social', label: 'Social play' },
  { href: '/#membership', label: 'Membership' },
  { href: '/#shop', label: 'Shop' },
  { href: '/#bar', label: 'Bar & café' },
  { href: '/#visit', label: 'Visit' },
] as const;

export const ENQUIRY_PRESET_EVENT = 'enquiry:preset';

export interface EnquiryPreset {
  enquiry_type: EnquiryType;
  membership_plan_id?: Uuid;
}

/** Lets any CTA pre-select the enquiry form before the page scrolls to #visit. */
export function presetEnquiry(detail: EnquiryPreset) {
  window.dispatchEvent(new CustomEvent<EnquiryPreset>(ENQUIRY_PRESET_EVENT, { detail }));
}
