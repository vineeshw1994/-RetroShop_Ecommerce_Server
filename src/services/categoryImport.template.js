/** Column order for the bulk category import spreadsheet. */
export const CATEGORY_IMPORT_HEADERS = [
  'name',
  'slug',
  'parentSlug',
  'description',
  'sortOrder',
  'isActive',
  'isFeatured',
  'image',
];

/**
 * Sample rows: parent categories first, then sub-categories.
 * Leave parentSlug empty for top-level categories.
 * Slugs must be unique across the whole catalogue.
 */
export const SAMPLE_CATEGORY_ROWS = [
  ['Accessories', 'accessories', '', 'Cables, controllers and gaming add-ons', 1, 'yes', 'yes', ''],
  ['Consoles', 'consoles', '', 'Retro and classic gaming hardware', 2, 'yes', 'yes', ''],
  ['Games', 'games', '', 'Physical game discs and cartridges', 3, 'yes', 'yes', ''],
  ['Tech', 'tech', '', 'Phones, tablets, laptops and audio gear', 4, 'yes', 'yes', ''],
  ['Cables', 'cables', 'accessories', 'USB, HDMI and charging cables', 1, 'yes', 'no', ''],
  ['Controllers', 'controllers', 'accessories', 'Wireless pads and steering wheels', 2, 'yes', 'no', ''],
  ['Retro', 'retro', 'consoles', 'Classic 16-bit and earlier consoles', 1, 'yes', 'no', ''],
  ['Nintendo', 'nintendo', 'games', 'Switch and legacy Nintendo titles', 1, 'yes', 'no', ''],
  ['PlayStation', 'playstation-2', 'games', 'PS4 and PS5 game discs', 2, 'yes', 'no', ''],
  ['Xbox', 'xbox-2', 'games', 'Xbox Series and One titles', 3, 'yes', 'no', ''],
  ['Audio', 'audio', 'tech', 'Headphones, earbuds and speakers', 1, 'yes', 'no', ''],
  ['Laptops', 'laptops', 'tech', 'Refurbished notebooks and ultrabooks', 2, 'yes', 'no', ''],
  ['Phones', 'phones', 'tech', 'Unlocked smartphones', 3, 'yes', 'no', ''],
  ['Tablets', 'tablets', 'tech', 'iPad and Android tablets', 4, 'yes', 'no', ''],
];
