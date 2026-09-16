import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as authController from '../controllers/auth.controller.js';
import * as adminAuthController from '../controllers/adminAuth.controller.js';
import { protectCustomer, protectAdmin } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  signupValidator,
  loginValidator,
  emailOnlyValidator,
  verifyOtpValidator,
  resetPasswordValidator,
} from '../validators/auth.validator.js';

const router = Router();

/** Credential endpoints get a tighter budget than the global API limiter. */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many attempts, please try again later' },
});

const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 6,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many code requests, please wait a few minutes' },
});

router.post('/signup', authLimiter, signupValidator, validate, authController.signup);
router.post('/verify-email', authLimiter, verifyOtpValidator, validate, authController.verifyEmail);
router.post('/resend-code', otpLimiter, emailOnlyValidator, validate, authController.resendVerification);
router.post('/login', authLimiter, loginValidator, validate, authController.login);
router.post('/forgot-password', otpLimiter, emailOnlyValidator, validate, authController.forgotPassword);
router.post('/reset-password', authLimiter, resetPasswordValidator, validate, authController.resetPassword);
router.post('/refresh', authController.refresh);
router.post('/logout', authController.logout);
router.get('/me', protectCustomer, authController.me);

router.post('/admin/login', authLimiter, loginValidator, validate, adminAuthController.login);
router.post('/admin/forgot-password', otpLimiter, emailOnlyValidator, validate, adminAuthController.forgotPassword);
router.post('/admin/reset-password', authLimiter, resetPasswordValidator, validate, adminAuthController.resetPassword);
router.post('/admin/refresh', adminAuthController.refresh);
router.post('/admin/logout', adminAuthController.logout);
router.get('/admin/me', protectAdmin, adminAuthController.me);

export default router;
