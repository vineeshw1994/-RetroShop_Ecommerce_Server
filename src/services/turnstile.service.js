import config from '../config/index.js';
import AppError from '../utils/AppError.js';

/**
 * Verify a Cloudflare Turnstile token. When no secret key is configured the
 * check is skipped so local development does not need a Cloudflare account.
 */
export const verifyTurnstile = async (token, remoteIp) => {
  if (!config.turnstile.secretKey) {
    if (config.nodeEnv === 'development') return { skipped: true };
    throw new AppError('Human verification is not configured', 500);
  }

  if (!token) {
    throw new AppError('Please complete the human verification challenge', 400);
  }

  const body = new URLSearchParams({
    secret: config.turnstile.secretKey,
    response: token,
  });
  if (remoteIp) body.append('remoteip', remoteIp);

  let data;
  try {
    const response = await fetch(config.turnstile.verifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    data = await response.json();
  } catch {
    throw new AppError('Could not reach the verification service, please retry', 503);
  }

  if (!data.success) {
    throw new AppError('Human verification failed, please try again', 400);
  }

  return { success: true };
};

export default verifyTurnstile;
