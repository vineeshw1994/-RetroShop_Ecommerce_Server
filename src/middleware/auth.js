import { User, AdminUser } from '../models/index.js';
import { verifyAccessToken } from '../helpers/token.js';
import { sanitizePermissions } from '../config/permissions.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';

const extractToken = (req) => {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return null;
};

const decode = (req) => {
  const token = extractToken(req);
  if (!token) throw new AppError('Authentication required', 401);
  return verifyAccessToken(token);
};

/** Require a signed-in customer. */
export const protectCustomer = asyncHandler(async (req, res, next) => {
  const payload = decode(req);

  if (payload.type !== 'access' || payload.actorType !== 'customer') {
    throw new AppError('Invalid session token', 401);
  }

  const user = await User.findByPk(payload.sub);
  if (!user) throw new AppError('Account no longer exists', 401);
  if (!user.isActive) throw new AppError('This account has been suspended', 403);

  req.user = user;
  next();
});

/** Attach `req.user` when a valid customer token is present, but never reject. */
export const optionalCustomer = asyncHandler(async (req, res, next) => {
  const token = extractToken(req);
  if (!token) return next();

  try {
    const payload = verifyAccessToken(token);
    if (payload.type === 'access' && payload.actorType === 'customer') {
      const user = await User.findByPk(payload.sub);
      if (user?.isActive) req.user = user;
    }
  } catch {
    // An invalid token simply means "treat this as a guest".
  }

  next();
});

/** Require a signed-in admin or staff member. */
export const protectAdmin = asyncHandler(async (req, res, next) => {
  const payload = decode(req);

  if (payload.type !== 'access' || payload.actorType !== 'admin') {
    throw new AppError('Invalid session token', 401);
  }

  const admin = await AdminUser.findByPk(payload.sub);
  if (!admin) throw new AppError('Account no longer exists', 401);
  if (!admin.isActive) throw new AppError('This staff account has been disabled', 403);

  req.admin = admin;
  next();
});

/** Reject anyone who is not the super admin. */
export const requireSuperAdmin = (req, res, next) => {
  if (req.admin?.role !== 'super_admin') {
    throw new AppError('Only the super admin can perform this action', 403);
  }
  next();
};

/**
 * Gate a route behind one or more permission keys, e.g. `can('products:update')`.
 * Super admins bypass the check entirely.
 */
export const can =
  (...required) =>
  (req, res, next) => {
    if (!req.admin) throw new AppError('Authentication required', 401);
    if (req.admin.role === 'super_admin') return next();

    const granted = sanitizePermissions(req.admin.permissions);
    const missing = required.filter((permission) => !granted.includes(permission));

    if (missing.length) {
      throw new AppError(
        `You do not have permission to do this (${missing.join(', ')})`,
        403
      );
    }

    next();
  };
