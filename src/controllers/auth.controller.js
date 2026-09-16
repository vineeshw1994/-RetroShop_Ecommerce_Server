import bcrypt from 'bcryptjs';
import { User, CartItem, Product, AdminUser } from '../models/index.js';
import {
  issueTokenPair,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllForActor,
  setRefreshCookie,
  clearRefreshCookie,
  refreshCookieName,
} from '../helpers/token.js';
import { serializeUser, serializeAdmin } from '../helpers/serializers.js';
import { PERMISSION_MODULES } from '../config/permissions.js';
import { createOtp, verifyOtp } from '../services/otp.service.js';
import { verifyTurnstile } from '../services/turnstile.service.js';
import { sendWelcomeEmail } from '../services/email.service.js';
import config from '../config/index.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';

const SALT_ROUNDS = 12;

/** Merge a guest's local basket into their account on sign in / sign up. */
const mergeGuestBasket = async (userId, guestItems) => {
  if (!Array.isArray(guestItems) || !guestItems.length) return;

  for (const entry of guestItems.slice(0, 50)) {
    const productId = Number(entry.productId);
    const quantity = Math.max(1, Math.min(10, Number(entry.quantity) || 1));
    if (!productId) continue;

    const product = await Product.findByPk(productId);
    if (!product || !product.isActive || product.stock < 1) continue;

    const existing = await CartItem.findOne({ where: { userId, productId } });
    const capped = Math.min(product.stock, quantity + (existing?.quantity || 0));

    if (existing) {
      existing.quantity = capped;
      await existing.save();
    } else {
      await CartItem.create({ userId, productId, quantity: capped });
    }
  }
};

const respondWithSession = async (res, req, user, statusCode = 200) => {
  const { accessToken, refreshToken } = await issueTokenPair(
    { id: user.id, actorType: 'customer' },
    req
  );

  setRefreshCookie(res, 'customer', refreshToken);

  res.status(statusCode).json({
    success: true,
    data: { user: serializeUser(user), accessToken, refreshToken },
  });
};

/** Staff can shop on the storefront with the same email they use in admin. */
const ensureStorefrontUser = async (admin) => {
  let user = await User.findOne({ where: { email: admin.email } });

  if (!user) {
    const parts = admin.name.trim().split(/\s+/);
    user = await User.create({
      firstName: parts[0] || 'Staff',
      lastName: parts.slice(1).join(' ') || 'Member',
      email: admin.email,
      phone: admin.phone || '0000000000',
      passwordHash: admin.passwordHash,
      isVerified: true,
      isActive: true,
    });
  } else {
    if (!user.isActive) {
      throw new AppError('This account has been suspended. Contact support.', 403);
    }
    if (!user.isVerified) {
      user.isVerified = true;
      await user.save();
    }
  }

  return user;
};

const respondWithStaffStorefrontSession = async (res, req, admin, shopUser) => {
  const customerTokens = await issueTokenPair({ id: shopUser.id, actorType: 'customer' }, req);
  const adminTokens = await issueTokenPair(
    { id: admin.id, actorType: 'admin', role: admin.role },
    req
  );

  setRefreshCookie(res, 'customer', customerTokens.refreshToken);
  setRefreshCookie(res, 'admin', adminTokens.refreshToken);

  res.json({
    success: true,
    data: {
      user: serializeUser(shopUser),
      admin: serializeAdmin(admin),
      accessToken: customerTokens.accessToken,
      refreshToken: customerTokens.refreshToken,
      adminAccessToken: adminTokens.accessToken,
      adminRefreshToken: adminTokens.refreshToken,
      permissionModules: PERMISSION_MODULES,
    },
  });
};

/** Issue admin dashboard tokens when a signed-in customer email matches active staff. */
const buildLinkedAdminSession = async (req, res, email) => {
  const admin = await AdminUser.findOne({ where: { email, isActive: true } });
  if (!admin) return null;

  const adminTokens = await issueTokenPair(
    { id: admin.id, actorType: 'admin', role: admin.role },
    req
  );

  setRefreshCookie(res, 'admin', adminTokens.refreshToken);

  return {
    admin: serializeAdmin(admin),
    adminAccessToken: adminTokens.accessToken,
    adminRefreshToken: adminTokens.refreshToken,
    permissionModules: PERMISSION_MODULES,
  };
};

export const signup = asyncHandler(async (req, res) => {
  const { firstName, lastName, email, phone, password, turnstileToken, marketingOptIn } =
    req.body;

  await verifyTurnstile(turnstileToken, req.ip);

  const existing = await User.findOne({ where: { email } });
  if (existing) {
    throw new AppError('An account with that email already exists', 409, [
      { field: 'email', message: 'Email already registered' },
    ]);
  }

  const user = await User.create({
    firstName,
    lastName,
    email,
    phone,
    passwordHash: await bcrypt.hash(password, SALT_ROUNDS),
    marketingOptIn: Boolean(marketingOptIn),
    isVerified: false,
  });

  const otpResult = await createOtp(email, 'signup');

  const data = { email: user.email, requiresVerification: true };
  if (config.nodeEnv === 'development' && otpResult.devCode) {
    data.devOtp = otpResult.devCode;
  }

  res.status(201).json({
    success: true,
    message: 'Account created. Enter the code we emailed you to verify it.',
    data,
  });
});

export const verifyEmail = asyncHandler(async (req, res) => {
  const { email, code, guestBasket } = req.body;

  const user = await User.findOne({ where: { email } });
  if (!user) throw new AppError('No account found for that email', 404);

  if (user.isVerified) {
    throw new AppError('This email is already verified, please sign in', 400);
  }

  await verifyOtp(email, code, 'signup');

  user.isVerified = true;
  user.lastLoginAt = new Date();
  await user.save();

  await mergeGuestBasket(user.id, guestBasket);
  await sendWelcomeEmail(user.email, user.firstName);

  await respondWithSession(res, req, user);
});

export const resendVerification = asyncHandler(async (req, res) => {
  const { email } = req.body;

  const user = await User.findOne({ where: { email } });
  if (!user) throw new AppError('No account found for that email', 404);
  if (user.isVerified) throw new AppError('This email is already verified', 400);

  const { expiresInMinutes, devCode } = await createOtp(email, 'signup');

  const data = { expiresInMinutes };
  if (config.nodeEnv === 'development' && devCode) {
    data.devOtp = devCode;
  }

  res.json({
    success: true,
    message: `A new code is on its way. It expires in ${expiresInMinutes} minutes.`,
    data,
  });
});

export const login = asyncHandler(async (req, res) => {
  const { email, password, turnstileToken, guestBasket } = req.body;

  await verifyTurnstile(turnstileToken, req.ip);

  const user = await User.scope('withPassword').findOne({ where: { email } });

  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    const admin = await AdminUser.scope('withPassword').findOne({ where: { email } });

    if (admin && (await bcrypt.compare(password, admin.passwordHash))) {
      if (!admin.isActive) {
        throw new AppError('This staff account has been disabled', 403);
      }

      admin.lastLoginAt = new Date();
      await admin.save();

      const shopUser = await ensureStorefrontUser(admin);
      shopUser.lastLoginAt = new Date();
      await shopUser.save();

      await mergeGuestBasket(shopUser.id, guestBasket);

      return respondWithStaffStorefrontSession(res, req, admin, shopUser);
    }

    throw new AppError('Email or password is incorrect', 401);
  }

  if (!user.isActive) {
    throw new AppError('This account has been suspended. Contact support.', 403);
  }

  if (!user.isVerified) {
    await createOtp(email, 'signup');
    return res.status(403).json({
      success: false,
      message: 'Please verify your email. We have sent you a new code.',
      data: { email: user.email, requiresVerification: true },
    });
  }

  user.lastLoginAt = new Date();
  await user.save();

  await mergeGuestBasket(user.id, guestBasket);

  const linkedAdmin = await AdminUser.scope('withPassword').findOne({ where: { email: user.email } });
  if (
    linkedAdmin &&
    linkedAdmin.isActive &&
    (await bcrypt.compare(password, linkedAdmin.passwordHash))
  ) {
    return respondWithStaffStorefrontSession(res, req, linkedAdmin, user);
  }

  await respondWithSession(res, req, user);
});

export const forgotPassword = asyncHandler(async (req, res) => {
  const { email, turnstileToken } = req.body;

  await verifyTurnstile(turnstileToken, req.ip);

  const user = await User.findOne({ where: { email } });

  // Always answer the same way so the endpoint cannot enumerate accounts.
  let devOtp;
  if (user) {
    const otpResult = await createOtp(email, 'forgot_password');
    if (config.nodeEnv === 'development' && otpResult.devCode) {
      devOtp = otpResult.devCode;
    }
  }

  res.json({
    success: true,
    message: 'If that email is registered, a reset code is on its way.',
    data: devOtp ? { devOtp } : undefined,
  });
});

export const resetPassword = asyncHandler(async (req, res) => {
  const { email, code, password } = req.body;

  const user = await User.findOne({ where: { email } });
  if (!user) throw new AppError('No account found for that email', 404);

  await verifyOtp(email, code, 'forgot_password');

  user.passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  user.isVerified = true;
  await user.save();

  // A password reset should log out every other device.
  await revokeAllForActor('customer', user.id);

  res.json({
    success: true,
    message: 'Password updated. You can now sign in with your new password.',
  });
});

export const refresh = asyncHandler(async (req, res) => {
  const presented = req.cookies?.[refreshCookieName('customer')] || req.body?.refreshToken;

  if (!presented) throw new AppError('No refresh token provided', 401);

  const rotated = await rotateRefreshToken(presented, req);
  if (!rotated || rotated.actorType !== 'customer') {
    clearRefreshCookie(res, 'customer');
    throw new AppError('Session expired, please sign in again', 401);
  }

  const user = await User.findByPk(rotated.actorId);
  if (!user || !user.isActive) {
    clearRefreshCookie(res, 'customer');
    throw new AppError('Session expired, please sign in again', 401);
  }

  setRefreshCookie(res, 'customer', rotated.refreshToken);

  res.json({
    success: true,
    data: {
      user: serializeUser(user),
      accessToken: rotated.accessToken,
      refreshToken: rotated.refreshToken,
    },
  });
});

export const logout = asyncHandler(async (req, res) => {
  const presented = req.cookies?.[refreshCookieName('customer')] || req.body?.refreshToken;
  await revokeRefreshToken(presented);
  clearRefreshCookie(res, 'customer');
  res.json({ success: true, message: 'Signed out' });
});

export const me = asyncHandler(async (req, res) => {
  const linkedAdmin = await buildLinkedAdminSession(req, res, req.user.email);

  res.json({
    success: true,
    data: {
      user: serializeUser(req.user),
      ...linkedAdmin,
    },
  });
});
