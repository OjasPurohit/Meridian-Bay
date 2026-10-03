/**
 * Café menu transcribed from the supplied menu boards (hot brews, cold brews, all-day breakfast, between breads,
 * mains, salads, sides). Prices are the board prices, which state "exclusive of taxes". Per-item allergen icons are
 * not transcribed. Flat White's volume is omitted because the board prints "23 ml".
 */

export interface MenuItem {
  name: string;
  price: number;
  /** e.g. "146 kcal · 230 ml" */
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

export const MENU: MenuSection[] = [
  {
    id: 'hot-brews',
    kind: 'drinks',
    title: 'Hot brews',
    tagline: 'Hot coffees, brewed fresh for you.',
    groups: [
      {
        label: 'White',
        items: [
          { name: 'Cortado', price: 220, detail: '63 kcal · 100 ml' },
          { name: 'Cappuccino', price: 230, detail: '146 kcal · 230 ml' },
          { name: 'Flat White', price: 230, detail: '146 kcal' },
          { name: 'Latte', price: 240, detail: '159 kcal · 230 ml' },
          { name: 'Spanish Latte', price: 270, detail: '159 kcal · 230 ml' },
          { name: 'Hot Chocolate', price: 270, detail: '404 kcal · 240 ml' },
          { name: 'Mocha', price: 280, detail: '346 kcal · 240 ml' },
          { name: 'Vanilla Bean Latte', price: 260, detail: '475 kcal · 350 ml', isNew: true },
        ],
      },
      {
        label: 'Black',
        items: [
          { name: 'Espresso', price: 190, detail: '20 kcal · 100 ml' },
          { name: 'Americano', price: 200, detail: '22 kcal · 220 ml' },
          { name: 'Pour Over', price: 230, detail: '56 kcal · 280 ml' },
        ],
      },
    ],
  },
  {
    id: 'cold-brews',
    kind: 'drinks',
    title: 'Cold brews',
    tagline: 'Iced coffees for the walk back from the court.',
    groups: [
      {
        label: 'White',
        items: [
          { name: 'Cold Brew', price: 230, detail: '113 kcal · 280 ml' },
          { name: 'Iced Cappuccino', price: 250, detail: '172 kcal · 280 ml' },
          { name: 'Iced Latte', price: 260, detail: '136 kcal · 315 ml' },
          { name: 'Vietnamese Style Iced Coffee', price: 260, detail: '260 kcal · 300 ml' },
          { name: 'Affogato', price: 270, detail: '170 kcal · 100 ml' },
          { name: 'Vanilla Bean Latte', price: 280, detail: '161 kcal · 327 ml', isNew: true },
          { name: 'Iced Mocha', price: 300, detail: '475 kcal · 350 ml' },
          { name: 'Trioccino Frappe', price: 320, detail: '475 kcal · 350 ml' },
          { name: 'Vienna Latte', price: 330, detail: '195 kcal · 210 ml', isNew: true },
        ],
      },
      {
        label: 'Black',
        items: [
          { name: 'Iced Espresso', price: 200, detail: '20 kcal · 100 ml' },
          { name: 'Iced Americano', price: 210, detail: '22 kcal · 220 ml' },
          { name: 'Iced Pour Over', price: 240, detail: '56 kcal · 280 ml' },
        ],
      },
    ],
  },
  {
    id: 'breakfast',
    kind: 'food',
    title: 'All-day breakfast',
    tagline: 'The day starts when you want it to.',
    groups: [
      {
        items: [
          { name: 'Cinnamon Pancakes', price: 330, detail: '394 kcal' },
          { name: 'Chia Seed and Jam Pancakes', price: 350, detail: '373 kcal' },
          { name: 'Blue Tokai Coffee Pancakes', price: 360, detail: '966 kcal' },
        ],
      },
    ],
  },
  {
    id: 'between-breads',
    kind: 'food',
    title: 'Between breads',
    tagline: 'Sandwiches and wraps.',
    groups: [
      {
        items: [
          { name: 'Spicy Mushroom Sourdough Sandwich', price: 300, detail: '466 kcal' },
          { name: 'Tomato, Pesto & Feta Croissant Sandwich', price: 330, detail: '553 kcal' },
          { name: 'Tomato Stracciatella', price: 360, detail: 'Sandwich 761 kcal · wrap 628 kcal' },
          { name: 'Peri Peri Grilled Cottage Cheese', price: 390, detail: 'Sandwich 901 kcal · wrap 421 kcal' },
          { name: 'Super Veggie', price: 390, detail: 'Sandwich 461 kcal · wrap 469 kcal' },
        ],
      },
    ],
  },
  {
    id: 'mains',
    kind: 'food',
    title: 'Mains',
    tagline: 'Hearty plates that pair well with coffee.',
    groups: [
      {
        items: [
          { name: 'Basil Pesto Pasta', price: 440, detail: '1480 kcal' },
          { name: 'Spaghetti Aglio e Olio', price: 440, detail: '655 kcal' },
          { name: 'Spaghetti in Mushroom Florentine', price: 450, detail: '779 kcal' },
        ],
      },
    ],
  },
  {
    id: 'salads',
    kind: 'food',
    title: 'Salads',
    tagline: 'Fresh, light and bright.',
    groups: [{ items: [{ name: 'Millet Tabouleh', price: 360, detail: '283 kcal' }] }],
  },
  {
    id: 'sides',
    kind: 'food',
    title: 'Sides',
    tagline: 'Something to share with the table.',
    groups: [
      {
        items: [
          { name: 'Parsley Garlic Cheese Fries', price: 310, detail: '496 kcal' },
          { name: 'Peri Peri Fries', price: 300, detail: '392 kcal' },
        ],
      },
    ],
  },
];
