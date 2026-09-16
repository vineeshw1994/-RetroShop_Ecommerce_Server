import { body } from 'express-validator';
import { ALL_PERMISSIONS } from '../config/permissions.js';

export const productValidator = [
  body('name').trim().notEmpty().withMessage('Product name is required').isLength({ max: 200 }),
  body('sku').trim().notEmpty().withMessage('SKU is required').isLength({ max: 64 }),
  body('categoryId').isInt({ min: 1 }).withMessage('Choose a category'),
  body('price').isFloat({ min: 0 }).withMessage('Enter a valid price'),
  body('salePrice')
    .optional({ values: 'falsy' })
    .isFloat({ min: 0 })
    .withMessage('Enter a valid sale price')
    .custom((value, { req }) => {
      if (Number(value) >= Number(req.body.price)) {
        throw new Error('Sale price must be below the normal price');
      }
      return true;
    }),
  body('costPrice').optional({ values: 'falsy' }).isFloat({ min: 0 }),
  body('tradeInPrice').optional({ values: 'falsy' }).isFloat({ min: 0 }),
  body('stock').optional().isInt({ min: 0 }).withMessage('Stock must be 0 or more'),
  body('lowStockThreshold').optional().isInt({ min: 0, max: 1000 }),
  body('warrantyMonths').optional().isInt({ min: 0, max: 240 }),
  body('condition')
    .optional()
    .isIn(['new', 'like_new', 'very_good', 'good', 'fair'])
    .withMessage('Choose a valid condition'),
  body('shortDescription').optional({ values: 'falsy' }).isLength({ max: 300 }),
  body('platform').optional({ values: 'falsy' }).trim().isLength({ max: 80 }),
  body('brand').optional({ values: 'falsy' }).trim().isLength({ max: 80 }),
];

export const productUpdateValidator = productValidator.map((chain) => chain.optional());

export const categoryValidator = [
  body('name').trim().notEmpty().withMessage('Category name is required').isLength({ max: 120 }),
  body('description').optional({ values: 'falsy' }).isLength({ max: 2000 }),
  body('parentId').optional({ values: 'falsy' }).isInt({ min: 1 }),
  body('sortOrder').optional({ values: 'falsy' }).isInt({ min: -999, max: 999 }),
];

export const bannerValidator = [
  body('title').trim().notEmpty().withMessage('Banner title is required').isLength({ max: 160 }),
  body('subtitle').optional({ values: 'falsy' }).isLength({ max: 240 }),
  body('linkType').optional().isIn(['none', 'category', 'product']),
  body('linkCategoryId').optional({ values: 'falsy' }).isInt({ min: 1 }),
  body('linkProductId').optional({ values: 'falsy' }).isInt({ min: 1 }),
  body('linkProductIds').optional({ values: 'falsy' }),
  body('ctaLabel').optional({ values: 'falsy' }).isLength({ max: 60 }),
  body('placement')
    .optional()
    .isIn(['home_hero', 'home_side', 'promo_strip', 'category_top'])
    .withMessage('Choose a valid placement'),
  body('sortOrder').optional({ values: 'falsy' }).isInt({ min: -999, max: 999 }),
  body('startsAt').optional({ values: 'falsy' }).isISO8601().withMessage('Invalid start date'),
  body('endsAt')
    .optional({ values: 'falsy' })
    .isISO8601()
    .withMessage('Invalid end date')
    .custom((value, { req }) => {
      if (req.body.startsAt && new Date(value) <= new Date(req.body.startsAt)) {
        throw new Error('End date must be after the start date');
      }
      return true;
    }),
];

export const orderStatusValidator = [
  body('status')
    .isIn([
      'pending',
      'confirmed',
      'processing',
      'packed',
      'shipped',
      'delivered',
      'cancelled',
      'refunded',
    ])
    .withMessage('Choose a valid status'),
  body('note').optional({ values: 'falsy' }).isLength({ max: 300 }),
  body('trackingNumber').optional({ values: 'falsy' }).isLength({ max: 80 }),
  body('courier').optional({ values: 'falsy' }).isLength({ max: 80 }),
];

export const staffValidator = [
  body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 120 }),
  body('email').isEmail().withMessage('Enter a valid email address').normalizeEmail(),
  body('phone')
    .optional({ values: 'falsy' })
    .trim()
    .matches(/^[+\d][\d\s()-]{6,22}$/)
    .withMessage('Enter a valid phone number'),
  body('jobTitle').optional({ values: 'falsy' }).trim().isLength({ max: 120 }),
  body('role').optional().isIn(['staff', 'super_admin']).withMessage('Choose a valid role'),
  body('permissions')
    .optional()
    .isArray()
    .withMessage('Permissions must be a list')
    .custom((value) => {
      const invalid = value.filter((entry) => !ALL_PERMISSIONS.includes(entry));
      if (invalid.length) throw new Error(`Unknown permissions: ${invalid.join(', ')}`);
      return true;
    }),
  body('password')
    .optional({ values: 'falsy' })
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters'),
];

export const staffUpdateValidator = [
  body('name').optional().trim().notEmpty().isLength({ max: 120 }),
  body('email').optional().isEmail().withMessage('Enter a valid email address').normalizeEmail(),
  body('phone')
    .optional({ values: 'falsy' })
    .trim()
    .matches(/^[+\d][\d\s()-]{6,22}$/)
    .withMessage('Enter a valid phone number'),
  body('jobTitle').optional({ values: 'falsy' }).trim().isLength({ max: 120 }),
  body('role').optional().isIn(['staff', 'super_admin']),
  body('isActive').optional().isBoolean(),
  body('permissions')
    .optional()
    .isArray()
    .custom((value) => {
      const invalid = value.filter((entry) => !ALL_PERMISSIONS.includes(entry));
      if (invalid.length) throw new Error(`Unknown permissions: ${invalid.join(', ')}`);
      return true;
    }),
];

export const stockAdjustValidator = [
  body('quantityChange').isInt().withMessage('Enter a whole number'),
  body('type')
    .optional()
    .isIn(['restock', 'adjustment', 'return', 'cancellation'])
    .withMessage('Choose a valid adjustment type'),
  body('note').optional({ values: 'falsy' }).isLength({ max: 255 }),
  body('reference').optional({ values: 'falsy' }).isLength({ max: 64 }),
];

export const gameRequestResponseValidator = [
  body('status')
    .optional()
    .isIn(['pending', 'sourcing', 'found', 'unavailable', 'fulfilled'])
    .withMessage('Choose a valid status'),
  body('adminResponse').optional({ values: 'falsy' }).isLength({ max: 2000 }),
  body('linkedProductId').optional({ values: 'falsy' }).isInt({ min: 1 }),
];
