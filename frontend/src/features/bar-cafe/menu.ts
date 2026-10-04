/**
 * The café menu page is a view of the ONE canonical menu: the `bar_menu_items` table, read through GET /bar/menu (the
 * same records the member kitchen screen and the kitchen POS use). Nothing about the menu is stored in the frontend.
 * This file only groups those records into the page's sections.
 */
import type { BarMenuItem } from '@shared/types/rows';

export interface MenuItem {
  id: string;
  name: string;
  price: number;
  /** The item's description, when it has one. */
  detail?: string;
  isNew?: boolean;
}

export interface MenuGroup {
  label?: string;
  items: MenuItem[];
}

export interface MenuSection {
  id: string;
  kind: 'drinks' | 'food';
  title: string;
  tagline: string;
  groups: MenuGroup[];
}

const SECTIONS: { category: BarMenuItem['category']; id: string; kind: MenuSection['kind']; title: string; tagline: string }[] = [
  { category: 'DRINK', id: 'drinks', kind: 'drinks', title: 'Drinks', tagline: 'Coffee, juices and cold drinks, made to order.' },
  { category: 'SNACK', id: 'snacks', kind: 'food', title: 'Snacks', tagline: 'Sandwiches and bites for between games.' },
  { category: 'FOOD', id: 'mains', kind: 'food', title: 'Mains', tagline: 'Hearty plates that pair well with coffee.' },
];

/** Groups the available menu records by category, keeping the table's own order (sort_order). */
export function buildMenuSections(items: BarMenuItem[]): MenuSection[] {
  const ordered = items.filter((i) => i.is_available).sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
  return SECTIONS.map((s) => ({
    id: s.id,
    kind: s.kind,
    title: s.title,
    tagline: s.tagline,
    groups: [{ items: ordered.filter((i) => i.category === s.category).map((i) => ({ id: i.id, name: i.name, price: parseFloat(i.price), detail: i.description ?? undefined })) }],
  })).filter((s) => s.groups[0]!.items.length > 0);
}
