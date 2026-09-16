import { Op } from 'sequelize';
import config from '../config/index.js';
import { Otp } from '../models/index.js';
import { hashToken, generateOtpCode } from '../helpers/token.js';
import AppError from '../utils/AppError.js';
import { sendOtpEmail } from './email.service.js';

const MAX_ATTEMPTS = 5;

/** Invalidate previous codes, store a hash of the new one, and email it. */
export const createOtp = async (email, purpose) => {
  await Otp.update(
    { consumedAt: new Date() },
    { where: { email, purpose, consumedAt: null } }
  );

  const code = generateOtpCode();

  await Otp.create({
    email,
    codeHash: hashToken(code),
    purpose,
    expiresAt: new Date(Date.now() + config.otpExpiryMinutes * 60 * 1000),
  });

  const mailResult = await sendOtpEmail(email, code, purpose);

  return {
    expiresInMinutes: config.otpExpiryMinutes,
    devCode: mailResult.devMode ? code : undefined,
  };
};

/** Consume a code; throws with a helpful message when it is wrong or stale. */
export const verifyOtp = async (email, code, purpose) => {
  const record = await Otp.findOne({
    where: {
      email,
      purpose,
      consumedAt: null,
      expiresAt: { [Op.gt]: new Date() },
    },
    order: [['createdAt', 'DESC']],
  });

  if (!record) {
    throw new AppError('That code has expired, please request a new one', 400);
  }

  if (record.attempts >= MAX_ATTEMPTS) {
    throw new AppError('Too many incorrect attempts, please request a new code', 429);
  }

  if (record.codeHash !== hashToken(String(code))) {
    record.attempts += 1;
    await record.save();
    throw new AppError('The code you entered is incorrect', 400);
  }

  record.consumedAt = new Date();
  await record.save();

  return true;
};
