import bcrypt from 'bcryptjs';
import { AdminUser } from '../models/index.js';
import {
  issueTokenPair,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllForActor,
  setRefreshCookie,
  clearRefreshCookie,
  refreshCookieName,
} from '../helpers/token.js';
import { serializeAdmin } from '../helpers/serializers.js';
import { PERMISSION_MODULES } from '../config/permissions.js';
import { createOtp, verifyOtp } from '../services/otp.service.js';
import { verifyTurnstile } from '../services/turnstile.service.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';

const SALT_ROUNDS = 12;

/**
 * Staff and super admin sign in here. There is deliberately no admin signup
 * route: the super admin is seeded, and staff are created from the dashboard.
 */
export const login = asyncHandler(async (req, res) => {
  const { email, password, turnstileToken } = req.body;

  await verifyTurnstile(turnstileToken, req.ip);

  const admin = await AdminUser.scope('withPassword').findOne({ where: { email } });

  if (!admin || !(await bcrypt.compare(password, admin.passwordHash))) {
    throw new AppError('Email or password is incorrect', 401);
  }

  if (!admin.isActive) {
    throw new AppError('This staff account has been disabled', 403);
  }

  admin.lastLoginAt = new Date();
  await admin.save();

  const { accessToken, refreshToken } = await issueTokenPair(
    { id: admin.id, actorType: 'admin', role: admin.role },
    req
  );

  setRefreshCookie(res, 'admin', refreshToken);

  res.json({
    success: true,
    data: {
      admin: serializeAdmin(admin),
      accessToken,
      refreshToken,
      permissionModules: PERMISSION_MODULES,
    },
  });
});

export const forgotPassword = asyncHandler(async (req, res) => {
  const { email, turnstileToken } = req.body;

  await verifyTurnstile(turnstileToken, req.ip);

  const admin = await AdminUser.findOne({ where: { email } });
  if (admin?.isActive) await createOtp(email, 'admin_reset');

  res.json({
    success: true,
    message: 'If that email belongs to a staff account, a reset code is on its way.',
  });
});

export const resetPassword = asyncHandler(async (req, res) => {
  const { email, code, password } = req.body;

  const admin = await AdminUser.findOne({ where: { email } });
  if (!admin) throw new AppError('No staff account found for that email', 404);

  await verifyOtp(email, code, 'admin_reset');

  admin.passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  admin.mustChangePassword = false;
  await admin.save();

  await revokeAllForActor('admin', admin.id);

  res.json({ success: true, message: 'Password updated. Please sign in.' });
});

export const refresh = asyncHandler(async (req, res) => {
  const presented = req.cookies?.[refreshCookieName('admin')] || req.body?.refreshToken;

  if (!presented) throw new AppError('No refresh token provided', 401);

  const rotated = await rotateRefreshToken(presented, req);
  if (!rotated || rotated.actorType !== 'admin') {
    clearRefreshCookie(res, 'admin');
    throw new AppError('Session expired, please sign in again', 401);
  }

  const admin = await AdminUser.findByPk(rotated.actorId);
  if (!admin || !admin.isActive) {
    clearRefreshCookie(res, 'admin');
    throw new AppError('Session expired, please sign in again', 401);
  }

  setRefreshCookie(res, 'admin', rotated.refreshToken);

  res.json({
    success: true,
    data: {
      admin: serializeAdmin(admin),
      accessToken: rotated.accessToken,
      refreshToken: rotated.refreshToken,
      permissionModules: PERMISSION_MODULES,
    },
  });
});

export const logout = asyncHandler(async (req, res) => {
  const presented = req.cookies?.[refreshCookieName('admin')] || req.body?.refreshToken;
  await revokeRefreshToken(presented);
  clearRefreshCookie(res, 'admin');
  res.json({ success: true, message: 'Signed out' });
});

export const me = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    data: { admin: serializeAdmin(req.admin), permissionModules: PERMISSION_MODULES },
  });
});
