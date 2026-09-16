import { body, param, query } from 'express-validator';

export const idParam = [param('id').isInt({ min: 1 }).withMessage('Invalid id')];

export const paginationQuery = [
  query('page').optional().isInt({ min: 1 }).withMessage('Invalid page'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Invalid limit'),
];

export const addToBasketValidator = [
  body('productId').isInt({ min: 1 }).withMessage('A product is required'),
  body('quantity').optional().isInt({ min: 1, max: 10 }).withMessage('Quantity must be 1-10'),
];

export const updateBasketValidator = [
  ...idParam,
  body('quantity').isInt({ min: 0, max: 10 }).withMessage('Quantity must be 0-10'),
];

export const addressValidator = [
  body('fullName').trim().notEmpty().withMessage('Full name is required').isLength({ max: 120 }),
  body('phone')
    .trim()
    .matches(/^[+\d][\d\s()-]{6,22}$/)
    .withMessage('Enter a valid phone number'),
  body('line1').trim().notEmpty().withMessage('Address line 1 is required').isLength({ max: 160 }),
  body('line2').optional({ values: 'falsy' }).trim().isLength({ max: 160 }),
  body('city').trim().notEmpty().withMessage('City is required').isLength({ max: 80 }),
  body('state').optional({ values: 'falsy' }).trim().isLength({ max: 80 }),
  body('postcode').trim().notEmpty().withMessage('Postcode is required').isLength({ max: 20 }),
  body('country').optional({ values: 'falsy' }).trim().isLength({ max: 80 }),
  body('label').optional({ values: 'falsy' }).trim().isLength({ max: 40 }),
  body('isDefault').optional().isBoolean(),
];

export const checkoutValidator = [
  body('paymentMethod')
    .optional()
    .isIn(['card', 'cash_on_delivery', 'bank_transfer'])
    .withMessage('Choose a valid payment method'),
  body('addressId').optional().isInt({ min: 1 }),
  body('customerNote').optional({ values: 'falsy' }).isLength({ max: 500 }),
  body('shippingAddress')
    .custom((value, { req }) => {
      if (req.body.addressId) return true;
      if (!value || typeof value !== 'object') {
        throw new Error('A delivery address is required');
      }
      for (const field of ['fullName', 'phone', 'line1', 'city', 'postcode']) {
        if (!String(value[field] || '').trim()) {
          throw new Error(`Delivery address ${field} is required`);
        }
      }
      return true;
    }),
];

export const gameRequestValidator = [
  body('title').trim().notEmpty().withMessage('Which game are you after?').isLength({ max: 200 }),
  body('platform').optional({ values: 'falsy' }).trim().isLength({ max: 80 }),
  body('conditionPreference').optional().isIn(['any', 'new', 'used']),
  body('maxBudget').optional({ values: 'falsy' }).isFloat({ min: 0, max: 100000 }),
  body('notes').optional({ values: 'falsy' }).isLength({ max: 1000 }),
];

export const reviewValidator = [
  body('productId').isInt({ min: 1 }).withMessage('A product is required'),
  body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be 1-5'),
  body('title').optional({ values: 'falsy' }).trim().isLength({ max: 160 }),
  body('body').optional({ values: 'falsy' }).trim().isLength({ max: 2000 }),
];
