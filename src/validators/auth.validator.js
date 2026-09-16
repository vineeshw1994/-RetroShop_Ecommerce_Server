import { body } from 'express-validator';

const password = (field = 'password') =>
  body(field)
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters')
    .matches(/[a-z]/)
    .withMessage('Password must include a lowercase letter')
    .matches(/[A-Z]/)
    .withMessage('Password must include an uppercase letter')
    .matches(/\d/)
    .withMessage('Password must include a number');

const email = body('email')
  .isEmail()
  .withMessage('Enter a valid email address')
  .normalizeEmail();

const code = body('code')
  .isLength({ min: 6, max: 6 })
  .withMessage('Enter the 6 digit code')
  .isNumeric()
  .withMessage('The code should only contain numbers');

const confirmPassword = body('confirmPassword')
  .custom((value, { req }) => {
    if (value !== req.body.password) throw new Error('Passwords do not match');
    return true;
  });

export const signupValidator = [
  body('firstName')
    .trim()
    .notEmpty()
    .withMessage('First name is required')
    .isLength({ max: 60 })
    .withMessage('First name is too long'),
  body('lastName')
    .trim()
    .notEmpty()
    .withMessage('Last name is required')
    .isLength({ max: 60 })
    .withMessage('Last name is too long'),
  email,
  body('phone')
    .trim()
    .matches(/^[+\d][\d\s()-]{6,22}$/)
    .withMessage('Enter a valid phone number'),
  password(),
  confirmPassword,
];

export const loginValidator = [
  email,
  body('password').notEmpty().withMessage('Password is required'),
];

export const emailOnlyValidator = [email];

export const verifyOtpValidator = [email, code];

export const resetPasswordValidator = [email, code, password(), confirmPassword];

export const changePasswordValidator = [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  password('newPassword'),
  body('confirmPassword').custom((value, { req }) => {
    if (value !== req.body.newPassword) throw new Error('Passwords do not match');
    return true;
  }),
];

export const updateProfileValidator = [
  body('firstName').optional().trim().isLength({ min: 1, max: 60 }),
  body('lastName').optional().trim().isLength({ min: 1, max: 60 }),
  body('phone')
    .optional()
    .trim()
    .matches(/^[+\d][\d\s()-]{6,22}$/)
    .withMessage('Enter a valid phone number'),
  body('marketingOptIn').optional().isBoolean(),
];
