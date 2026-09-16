import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import config from '../config/index.js';
import { RefreshToken } from '../models/index.js';

const REFRESH_COOKIE = {
  customer: 'rs_refresh',
  admin: 'rs_admin_refresh',
};

export const hashToken = (token) =>
  crypto.createHash('sha256').update(token).digest('hex');

export const signAccessToken = ({ id, actorType, role = null }) =>
  jwt.sign({ sub: id, actorType, role, type: 'access' }, config.jwt.accessSecret, {
    expiresIn: config.jwt.accessExpiresIn,
  });

export const signRefreshToken = ({ id, actorType }) =>
  jwt.sign(
    { sub: id, actorType, type: 'refresh', jti: crypto.randomUUID() },
    config.jwt.refreshSecret,
    { expiresIn: config.jwt.refreshExpiresIn }
  );

export const verifyAccessToken = (token) => jwt.verify(token, config.jwt.accessSecret);

export const verifyRefreshToken = (token) => jwt.verify(token, config.jwt.refreshSecret);

/** Issue an access/refresh pair and persist the refresh hash for revocation. */
export const issueTokenPair = async ({ id, actorType, role = null }, req) => {
  const accessToken = signAccessToken({ id, actorType, role });
  const refreshToken = signRefreshToken({ id, actorType });
  const { exp } = jwt.decode(refreshToken);

  await RefreshToken.create({
    tokenHash: hashToken(refreshToken),
    actorType,
    actorId: id,
    expiresAt: new Date(exp * 1000),
    userAgent: req?.headers?.['user-agent']?.slice(0, 255) || null,
    ipAddress: req?.ip || null,
  });

  return { accessToken, refreshToken };
};

/** Rotate a refresh token: revoke the presented one, hand back a fresh pair. */
export const rotateRefreshToken = async (presentedToken, req) => {
  const stored = await RefreshToken.findOne({
    where: { tokenHash: hashToken(presentedToken) },
  });

  if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
    return null;
  }

  const pair = await issueTokenPair(
    { id: stored.actorId, actorType: stored.actorType, role: null },
    req
  );

  stored.revokedAt = new Date();
  stored.replacedByHash = hashToken(pair.refreshToken);
  await stored.save();

  return { ...pair, actorType: stored.actorType, actorId: stored.actorId };
};

export const revokeRefreshToken = async (presentedToken) => {
  if (!presentedToken) return;
  await RefreshToken.update(
    { revokedAt: new Date() },
    { where: { tokenHash: hashToken(presentedToken), revokedAt: null } }
  );
};

export const revokeAllForActor = async (actorType, actorId) => {
  await RefreshToken.update(
    { revokedAt: new Date() },
    { where: { actorType, actorId, revokedAt: null } }
  );
};

export const refreshCookieName = (actorType) => REFRESH_COOKIE[actorType];

export const setRefreshCookie = (res, actorType, token) => {
  res.cookie(refreshCookieName(actorType), token, {
    httpOnly: true,
    secure: config.nodeEnv === 'production',
    sameSite: 'lax',
    path: '/api/auth',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
};

export const clearRefreshCookie = (res, actorType) => {
  res.clearCookie(refreshCookieName(actorType), { path: '/api/auth' });
};

export const generateOtpCode = () =>
  String(crypto.randomInt(100000, 1000000));
